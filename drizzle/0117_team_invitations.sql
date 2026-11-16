-- Invitations émises par l'administrateur ; code uniquement stocké sous forme de hash.
CREATE TABLE IF NOT EXISTS team_invitations (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS team_invitations_email_idx ON team_invitations(email,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_code_idx ON team_invitations(code_hash);
