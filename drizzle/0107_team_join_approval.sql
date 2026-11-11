-- Demandes d'adhésion après vérification d'un code e-mail Supabase.
-- Aucun accès bénévole n'est accordé tant que l'administration n'a pas approuvé.
CREATE TABLE IF NOT EXISTS team_join_requests (
 email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
 name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at INTEGER NOT NULL,
 reviewed_at INTEGER,
 reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_team_join_requests_pending ON team_join_requests(status,requested_at);
