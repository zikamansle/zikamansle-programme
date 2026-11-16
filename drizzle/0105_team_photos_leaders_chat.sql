-- Extension additive : photos facultatives des bénévoles / responsables et discussion privée entre responsables.
-- Aucun changement des anciennes tables ni perte de données.
CREATE TABLE IF NOT EXISTS team_member_photos (
 member_id TEXT PRIMARY KEY NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 4194304),
 updated_by TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_leader_messages (
 id TEXT PRIMARY KEY NOT NULL,
 author_id TEXT NOT NULL REFERENCES team_members(id),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1400),
 created_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS ix_team_leader_messages_created ON team_leader_messages(created_at);
