-- Contrôle des demandes de codes de connexion ZikaTeam (sans comptes Cloudflare Access).
-- Durée de conservation courte, purgée à chaque demande et à chaque vérification.
CREATE TABLE IF NOT EXISTS team_auth_attempts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN('otp','verify')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_team_auth_email ON team_auth_attempts(email,action,created_at);
CREATE INDEX IF NOT EXISTS ix_team_auth_ip ON team_auth_attempts(ip_hash,action,created_at);
