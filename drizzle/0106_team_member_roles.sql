-- Qualifications visibles dans les fiches, distinctes des autorisations techniques.
-- Dirigeant / membre du bureau n'accorde pas de droits administrateur.
CREATE TABLE IF NOT EXISTS team_member_roles (
 member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('director','bureau')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(member_id,role)
);
CREATE INDEX IF NOT EXISTS ix_team_member_roles_role ON team_member_roles(role,member_id);
