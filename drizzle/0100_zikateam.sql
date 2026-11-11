-- ZikaTeam: espace privé des bénévoles (base de validation D1).
-- Aucune donnée personnelle de bénévole n'est ajoutée par cette migration.
CREATE TABLE IF NOT EXISTS team_members (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_poles (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_memberships (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 pole_id TEXT NOT NULL REFERENCES team_poles(id) ON DELETE CASCADE,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN('member','lead')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,pole_id)
);
CREATE TABLE IF NOT EXISTS team_charter (
 id INTEGER PRIMARY KEY CHECK(id=1),
 version TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 document_id TEXT,
 published_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_charter_acceptances (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 version TEXT NOT NULL,
 accepted_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,version)
);
CREATE TABLE IF NOT EXISTS team_activities (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN('meeting','stand','mission','setup')),
 title TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 place TEXT NOT NULL DEFAULT '',
 details TEXT NOT NULL DEFAULT '',
 agenda TEXT NOT NULL DEFAULT '',
 agenda_document_id TEXT,
 audience TEXT NOT NULL CHECK(audience IN('all','leaders','poles')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','cancelled')),
 created_by TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_activity_poles (
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 pole_id TEXT NOT NULL REFERENCES team_poles(id),
 PRIMARY KEY(activity_id,pole_id)
);
CREATE TABLE IF NOT EXISTS team_activity_rsvps (
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 answer TEXT NOT NULL CHECK(answer IN('yes','no','maybe')),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(activity_id,member_id)
);
CREATE TABLE IF NOT EXISTS team_shifts (
 id TEXT PRIMARY KEY,
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_shift_signups (
 shift_id TEXT NOT NULL REFERENCES team_shifts(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 signed_at INTEGER NOT NULL,
 PRIMARY KEY(shift_id,member_id)
);
CREATE TABLE IF NOT EXISTS team_messages (
 id TEXT PRIMARY KEY,
 author_id TEXT NOT NULL REFERENCES team_members(id),
 channel TEXT NOT NULL CHECK(channel IN('general','pole','activity')),
 channel_id TEXT,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS ix_team_messages_channel ON team_messages(channel,channel_id,created_at);
CREATE TABLE IF NOT EXISTS team_documents (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN('agenda','charter','instructions')),
 activity_id TEXT REFERENCES team_activities(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 uploaded_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_push_links (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL,
 linked_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS ix_team_push_links_sub ON team_push_links(subscription_id);
CREATE TABLE IF NOT EXISTS team_push_jobs (
 id TEXT PRIMARY KEY,
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN('created','updated','cancelled')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed')),
 created_at INTEGER NOT NULL,
 sent_at INTEGER,
 code INTEGER,
 UNIQUE(activity_id,subscription_id,reason)
);
CREATE INDEX IF NOT EXISTS ix_team_push_jobs_pending ON team_push_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS team_audit (
 id TEXT PRIMARY KEY,
 actor_email TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_id TEXT,
 detail TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_team_audit_new ON team_audit(created_at DESC);
