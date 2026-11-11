-- Suivi individuel des adhésions, réservé au Secrétariat et à l’administration.
-- Une date correspond à la date de règlement/adhésion, distincte de l’horodatage de saisie.
CREATE TABLE IF NOT EXISTS team_membership_dues (
 member_id TEXT PRIMARY KEY NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
 paid_on TEXT,
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL,
 CHECK(paid=0 OR paid_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_team_membership_dues_paid ON team_membership_dues(paid,paid_on);
