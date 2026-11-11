-- Devices enrolled through the native Android Firebase SDK on the staging Worker.
-- Keep separate from browser Web Push subscriptions and production devices.
CREATE TABLE IF NOT EXISTS native_push_devices (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL,
    created INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS native_push_devices_seen ON native_push_devices(last_seen);
CREATE INDEX IF NOT EXISTS native_push_devices_ip ON native_push_devices(ip_hash,created);
