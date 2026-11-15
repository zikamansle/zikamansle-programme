-- Documents officiels ZikaTeam : correspondance, ordre du jour et compte rendu.
CREATE TABLE IF NOT EXISTS team_written_documents (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('courrier','ordre_du_jour','compte_rendu','invitation')),
 activity_id TEXT REFERENCES team_activities(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected')),
 feedback TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 reviewed_by TEXT,
 reviewed_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_written_documents_updated ON team_written_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_written_documents_activity ON team_written_documents(activity_id);
