-- Suivi des adhésions, réservé au secrétariat et à l'administration.
-- Le statut est "en attente" (0) ou "à jour" (1).
-- La date du règlement et le moyen de paiement sont facultatifs lorsque l'adhésion est à jour.
CREATE TABLE IF NOT EXISTS team_membership_dues (
 member_id TEXT PRIMARY KEY NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
 paid_on TEXT,
 payment_method TEXT CHECK(payment_method IS NULL OR payment_method IN ('cash','card','check','transfer','other')),
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL,
 CHECK(paid=1 OR (paid_on IS NULL AND payment_method IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_team_membership_dues_paid ON team_membership_dues(paid,paid_on);
