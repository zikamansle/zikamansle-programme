-- Icônes de groupe personnalisées par l'administration.
CREATE TABLE IF NOT EXISTS team_chat_icons (
 channel TEXT NOT NULL,
 channel_id TEXT NOT NULL DEFAULT '',
 icon TEXT NOT NULL DEFAULT '💬',
 image_id TEXT,
 updated_by TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (channel,channel_id)
);
