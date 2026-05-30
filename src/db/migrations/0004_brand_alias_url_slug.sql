ALTER TABLE brand_aliases ADD COLUMN url_slug TEXT NOT NULL DEFAULT '';

UPDATE brand_aliases
SET url_slug = lower(replace(display_name, ' ', '-'))
WHERE url_slug = '';
