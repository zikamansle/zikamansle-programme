-- Modèles de listes confidentiels, uniquement accessibles à l'administration et au secrétariat.
CREATE TABLE IF NOT EXISTS team_saved_lists (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 columns_json TEXT NOT NULL,
 member_ids_json TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS team_saved_lists_updated_idx ON team_saved_lists(updated_at);
