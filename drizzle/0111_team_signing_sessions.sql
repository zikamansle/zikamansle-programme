-- Feuilles d'émargement créées par l'administration / secrétariat.
-- La signature est tracée par des points numériques, sans enregistrement d'image externe.
CREATE TABLE IF NOT EXISTS team_signing_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 place TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 closed_at INTEGER,
 ticket_hash TEXT,
 ticket_expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS team_signing_attendees (
 session_id TEXT NOT NULL REFERENCES team_signing_sessions(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 added_at INTEGER NOT NULL,
 signature_points TEXT,
 signed_at INTEGER,
 PRIMARY KEY(session_id,member_id)
);
CREATE INDEX IF NOT EXISTS ix_team_signing_attendees_session ON team_signing_attendees(session_id,added_at);
CREATE INDEX IF NOT EXISTS ix_team_signing_sessions_date ON team_signing_sessions(starts_at);
