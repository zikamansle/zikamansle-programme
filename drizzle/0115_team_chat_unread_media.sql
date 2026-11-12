-- Compteurs personnels de messages non lus et médias des discussions ZikaTeam.
CREATE TABLE IF NOT EXISTS team_chat_reads (
 member_id TEXT NOT NULL,
 channel TEXT NOT NULL,
 channel_id TEXT NOT NULL DEFAULT '',
 last_read_at INTEGER NOT NULL,
 PRIMARY KEY (member_id, channel, channel_id)
);
CREATE INDEX IF NOT EXISTS team_chat_reads_member_idx ON team_chat_reads(member_id);
CREATE TABLE IF NOT EXISTS team_chat_media (
 id TEXT PRIMARY KEY NOT NULL,
 channel TEXT NOT NULL,
 channel_id TEXT,
 message_id TEXT NOT NULL,
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 uploaded_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS team_chat_media_message_idx ON team_chat_media(message_id);
