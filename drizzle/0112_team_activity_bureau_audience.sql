-- Destinataires "Bureau uniquement", sans modifier la table de réunions existante.
CREATE TABLE IF NOT EXISTS team_activity_bureau_audience (
 activity_id TEXT PRIMARY KEY NOT NULL REFERENCES team_activities(id) ON DELETE CASCADE,
 added_at INTEGER NOT NULL
);
