CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  card_title_supplement TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  sub_model TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  mileage TEXT NOT NULL DEFAULT '',
  exterior_color TEXT NOT NULL DEFAULT '',
  interior_color TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT '嚴選車況',
  status TEXT NOT NULL DEFAULT 'draft',
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL DEFAULT '[]',
  monthly_recommended INTEGER NOT NULL DEFAULT 0,
  show_sold_case INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  local_edits_json TEXT NOT NULL DEFAULT '[]',
  sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX vehicles_source_external_idx ON vehicles(source, external_id);

CREATE TABLE vehicle_images (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE brand_aliases (
  source_brand TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  url_slug TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE import_mappings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  last_imported_at TEXT NOT NULL
);

CREATE UNIQUE INDEX import_mappings_source_external_idx ON import_mappings(source, external_id);

CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  permissions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE site_video_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE sell_inquiries (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year INTEGER,
  mileage INTEGER,
  exterior_color TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  photo_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE page_views (
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

CREATE INDEX page_views_created_at_idx ON page_views(created_at);
CREATE INDEX page_views_vehicle_slug_idx ON page_views(vehicle_slug);
CREATE INDEX page_views_session_id_idx ON page_views(session_id);

CREATE TABLE admin_activity_log (
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

CREATE INDEX admin_activity_log_created_at_idx ON admin_activity_log(created_at);
CREATE INDEX admin_activity_log_user_id_idx ON admin_activity_log(user_id);
