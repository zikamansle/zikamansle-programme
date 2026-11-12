-- Consentements explicites, distincts de la charte obligatoire.
-- Par défaut, aucune diffusion de coordonnées ni droit à l'image ne sont accordés.
CREATE TABLE IF NOT EXISTS team_member_consents (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('image','phone','email')),
 granted INTEGER NOT NULL CHECK(granted IN (0,1)),
 version TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,kind)
);
CREATE INDEX IF NOT EXISTS ix_team_member_consents_granted ON team_member_consents(kind,granted);
