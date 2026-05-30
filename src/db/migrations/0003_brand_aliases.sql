CREATE TABLE IF NOT EXISTS brand_aliases (
  source_brand TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO brand_aliases (source_brand, display_name, updated_at) VALUES
  ('法拉利', 'Ferrari', datetime('now')),
  ('賓利', 'Bentley', datetime('now')),
  ('賓利(A40)', 'Bentley', datetime('now')),
  ('藍寶堅尼', 'Lamborghini', datetime('now')),
  ('保時捷', 'Porsche', datetime('now')),
  ('邁巴赫(224)', 'Mercedes-Maybach', datetime('now')),
  ('RR', 'Rolls-Royce', datetime('now'))
ON CONFLICT(source_brand) DO NOTHING;
