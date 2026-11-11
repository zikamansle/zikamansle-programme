-- Messages privés entre deux membres, séparés des salons collectifs historiques.
CREATE TABLE IF NOT EXISTS team_direct_messages (
 id TEXT PRIMARY KEY NOT NULL,
 author_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS team_direct_messages_members_idx ON team_direct_messages(author_id,recipient_id,created_at);
CREATE INDEX IF NOT EXISTS team_direct_messages_recipient_idx ON team_direct_messages(recipient_id,created_at);
