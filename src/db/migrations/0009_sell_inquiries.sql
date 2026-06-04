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
