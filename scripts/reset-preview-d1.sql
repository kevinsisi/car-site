DELETE FROM vehicle_images WHERE id LIKE 'DEMO-%' OR vehicle_id LIKE 'DEMO-%';
DELETE FROM import_mappings WHERE id LIKE 'DEMO-%' OR source LIKE 'DEMO-%' OR external_id LIKE 'DEMO-%' OR vehicle_id LIKE 'DEMO-%';
DELETE FROM vehicles WHERE id LIKE 'DEMO-%' OR slug LIKE 'DEMO-%' OR external_id LIKE 'DEMO-%' OR source LIKE 'DEMO-%';
DELETE FROM site_settings WHERE key LIKE 'DEMO-%';
DELETE FROM brand_aliases WHERE source_brand LIKE 'DEMO-%';
