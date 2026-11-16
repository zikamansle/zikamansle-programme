-- Notifications internes durables et catégorie libre pour les rendez-vous ZikaTeam.
CREATE TABLE IF NOT EXISTS team_activity_custom_kinds (
 activity_id TEXT PRIMARY KEY NOT NULL,
 label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_activity_notices (
 id TEXT PRIMARY KEY NOT NULL,
 activity_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 seen_at INTEGER,
 UNIQUE(activity_id,member_id,reason)
);
CREATE INDEX IF NOT EXISTS team_activity_notices_member_idx ON team_activity_notices(member_id,created_at);
