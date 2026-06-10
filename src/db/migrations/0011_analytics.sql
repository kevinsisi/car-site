CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  vehicle_slug TEXT,
  session_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  referrer TEXT,
  status_code INTEGER NOT NULL DEFAULT 200,
  duration_ms INTEGER,
  is_bot INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at);
CREATE INDEX IF NOT EXISTS page_views_vehicle_slug_idx ON page_views (vehicle_slug);
CREATE INDEX IF NOT EXISTS page_views_session_id_idx ON page_views (session_id);

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_activity_log_created_at_idx ON admin_activity_log (created_at);
CREATE INDEX IF NOT EXISTS admin_activity_log_user_id_idx ON admin_activity_log (user_id);

-- Update superadmin to include the new ANALYTICS permission (0x2000, ALL now 0x3FFF)
UPDATE admin_users
SET permissions = 16383
WHERE role = 'superadmin';
