INSERT INTO vehicles (
  id, slug, title, brand, model, source, external_id, status,
  features_json, local_edits_json, created_at, updated_at
) VALUES (
  'DEMO-vehicle-sedan', 'DEMO-sedan', 'DEMO Synthetic Sedan', 'DEMO-brand', 'DEMO-model',
  'DEMO-source', 'DEMO-external-sedan', 'published', '[]', '[]',
  '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
), (
  'DEMO-vehicle-suv', 'DEMO-suv', 'DEMO Synthetic SUV', 'DEMO-brand', 'DEMO-model-suv',
  'DEMO-source', 'DEMO-external-suv', 'draft', '[]', '[]',
  '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  brand = excluded.brand,
  model = excluded.model,
  source = excluded.source,
  external_id = excluded.external_id,
  status = excluded.status,
  features_json = excluded.features_json,
  local_edits_json = excluded.local_edits_json,
  updated_at = excluded.updated_at;

INSERT INTO vehicle_images (id, vehicle_id, url, alt, sort_order, is_cover, created_at)
VALUES
  ('DEMO-image-sedan', 'DEMO-vehicle-sedan', 'DEMO-local-image://sedan', 'DEMO synthetic sedan', 0, 1, '2025-01-01T00:00:00.000Z'),
  ('DEMO-image-suv', 'DEMO-vehicle-suv', 'DEMO-local-image://suv', 'DEMO synthetic SUV', 0, 1, '2025-01-01T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  vehicle_id = excluded.vehicle_id,
  url = excluded.url,
  alt = excluded.alt,
  sort_order = excluded.sort_order,
  is_cover = excluded.is_cover,
  created_at = excluded.created_at;

INSERT INTO import_mappings (id, source, external_id, vehicle_id, last_imported_at)
VALUES
  ('DEMO-mapping-sedan', 'DEMO-source', 'DEMO-external-sedan', 'DEMO-vehicle-sedan', '2025-01-01T00:00:00.000Z'),
  ('DEMO-mapping-suv', 'DEMO-source', 'DEMO-external-suv', 'DEMO-vehicle-suv', '2025-01-01T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  source = excluded.source,
  external_id = excluded.external_id,
  vehicle_id = excluded.vehicle_id,
  last_imported_at = excluded.last_imported_at;

INSERT INTO site_settings (key, value, updated_at)
VALUES
  ('DEMO-setting-show-sold', 'false', '2025-01-01T00:00:00.000Z'),
  ('DEMO-setting-featured-count', '2', '2025-01-01T00:00:00.000Z')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

INSERT INTO brand_aliases (source_brand, display_name, url_slug, icon_url, updated_at)
VALUES ('DEMO-brand', 'DEMO Synthetic Brand', 'DEMO-brand', 'DEMO-local-icon://brand', '2025-01-01T00:00:00.000Z')
ON CONFLICT(source_brand) DO UPDATE SET
  display_name = excluded.display_name,
  url_slug = excluded.url_slug,
  icon_url = excluded.icon_url,
  updated_at = excluded.updated_at;
