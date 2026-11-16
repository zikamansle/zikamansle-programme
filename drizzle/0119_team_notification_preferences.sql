-- Préférences individuelles des notifications ZikaTeam.
CREATE TABLE IF NOT EXISTS team_notification_preferences (
 member_id TEXT PRIMARY KEY NOT NULL,
 chat_mode TEXT NOT NULL DEFAULT 'grouped',
 sound_mode TEXT NOT NULL DEFAULT 'important',
 vibrate INTEGER NOT NULL DEFAULT 1,
 activity_enabled INTEGER NOT NULL DEFAULT 1,
 urgent_enabled INTEGER NOT NULL DEFAULT 1,
 quiet_enabled INTEGER NOT NULL DEFAULT 1,
 quiet_start TEXT NOT NULL DEFAULT '22:00',
 quiet_end TEXT NOT NULL DEFAULT '08:00',
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_chat_mutes (
 member_id TEXT NOT NULL,
 channel TEXT NOT NULL,
 channel_id TEXT NOT NULL DEFAULT '',
 muted INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,channel,channel_id)
);
