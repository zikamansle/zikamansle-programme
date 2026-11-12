-- ZikaTeam: droits transversaux du secrétariat. Seul l'administrateur les attribue.
-- Ces droits ne donnent aucun pouvoir de modification sur les bénévoles, pôles ou réunions.
CREATE TABLE IF NOT EXISTS team_staff_roles (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('secretariat')),
 granted_by TEXT NOT NULL,
 granted_at INTEGER NOT NULL,
 PRIMARY KEY (member_id, role)
);
CREATE INDEX IF NOT EXISTS ix_team_staff_role ON team_staff_roles(role,member_id);