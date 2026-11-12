-- Coordonnées complètes des bénévoles : visibles uniquement de l'administration
-- et du secrétariat. Conservation des données existantes intacte.
CREATE TABLE IF NOT EXISTS team_member_contacts (
 member_id TEXT PRIMARY KEY NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',
 postal_code TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_team_member_contacts_city ON team_member_contacts(city,postal_code);
