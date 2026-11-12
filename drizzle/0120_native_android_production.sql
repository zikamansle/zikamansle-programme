-- Notifications Android Firebase, isolées du Web Push.
-- Le jeton reste côté serveur. Une liaison ZikaTeam exige une session bénévole.
CREATE TABLE IF NOT EXISTS native_push_links (
 device_id TEXT PRIMARY KEY NOT NULL,
 member_id TEXT NOT NULL,
 linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS native_push_links_member_idx ON native_push_links(member_id);
CREATE TABLE IF NOT EXISTS native_delivery_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 source_type TEXT NOT NULL,
 source_id TEXT NOT NULL,
 device_id TEXT NOT NULL,
 member_id TEXT,
 reason TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 code INTEGER,
 created_at INTEGER NOT NULL,
 sent_at INTEGER,
 UNIQUE(source_type,source_id,device_id,reason)
);
CREATE INDEX IF NOT EXISTS native_delivery_jobs_pending_idx ON native_delivery_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS native_delivery_jobs_device_idx ON native_delivery_jobs(device_id,created_at);
