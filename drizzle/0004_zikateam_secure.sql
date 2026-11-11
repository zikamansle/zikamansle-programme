-- ZikaTeam PRIVATE messaging and meetings (staging only).
-- Member emails and message content are not indexed or exposed to the public site.
CREATE TABLE IF NOT EXISTS team_members (
  email TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','lead','volunteer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_channels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  is_general INTEGER NOT NULL DEFAULT 0 CHECK(is_general IN (0,1))
);
CREATE TABLE IF NOT EXISTS team_memberships (
  email TEXT NOT NULL REFERENCES team_members(email) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES team_channels(id) ON DELETE CASCADE,
  PRIMARY KEY (email,channel_id)
);
CREATE TABLE IF NOT EXISTS team_messages (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES team_channels(id),
  author_email TEXT NOT NULL REFERENCES team_members(email),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1500),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS team_messages_by_room ON team_messages(channel_id,created_at);
CREATE INDEX IF NOT EXISTS team_messages_by_author ON team_messages(author_email,created_at);
CREATE TABLE IF NOT EXISTS team_meetings (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES team_channels(id),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  agenda TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES team_members(email),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS team_meetings_date ON team_meetings(starts_at);
CREATE TABLE IF NOT EXISTS team_attendance (
  meeting_id TEXT NOT NULL REFERENCES team_meetings(id) ON DELETE CASCADE,
  email TEXT NOT NULL REFERENCES team_members(email) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK(response IN ('yes','no','maybe')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(meeting_id,email)
);
INSERT OR IGNORE INTO team_channels(id,name,is_general) VALUES
('general','Général ZikaTeam',1),
('logistique','Logistique',0),
('artistes','Artistes et loges',0),
('restauration','Restauration',0),
('buvette','Buvette',0),
('decoration','Décoration et menuiserie',0),
('montage','Montage et technique',0),
('accueil','Accueil et billetterie',0),
('parking','Parking',0),
('proprete','Propreté',0),
('rangement','Rangement',0),
('parade','ZikaParade',0),
('communication','Communication',0),
('partenariats','Partenariats',0),
('zikarmonie','ZikArmonie',0);
