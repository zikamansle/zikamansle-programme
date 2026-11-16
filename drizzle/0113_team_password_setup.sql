-- Aucune valeur de mot de passe n'est stockée dans D1.
-- Le secret est détenu et vérifié exclusivement par Supabase Auth.
CREATE TABLE IF NOT EXISTS team_auth_password_setup (
 email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
 set_at INTEGER NOT NULL
);
