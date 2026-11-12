-- Gestion opérationnelle des bénévoles : tâches, pointages et rappels ciblés.
CREATE TABLE IF NOT EXISTS team_activity_tasks (
 id TEXT PRIMARY KEY,
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 assigned_to TEXT REFERENCES team_members(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN('todo','doing','done')),
 created_by TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_team_activity_tasks ON team_activity_tasks(activity_id,status);
CREATE TABLE IF NOT EXISTS team_activity_checkins (
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 checked_in_at INTEGER,
 checked_out_at INTEGER,
 checked_by TEXT NOT NULL,
 PRIMARY KEY(activity_id,member_id)
);
CREATE TABLE IF NOT EXISTS team_reminder_jobs (
 activity_id TEXT NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('24h','2h')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed')),
 created_at INTEGER NOT NULL,
 sent_at INTEGER,
 code INTEGER,
 PRIMARY KEY(activity_id,subscription_id,kind)
);
CREATE INDEX IF NOT EXISTS ix_team_reminders_status ON team_reminder_jobs(status,created_at);