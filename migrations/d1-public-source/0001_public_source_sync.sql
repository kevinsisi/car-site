CREATE TABLE source_sync_state (
  source TEXT PRIMARY KEY CHECK (source = 'mita-public'),
  baseline_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_body_hash TEXT NOT NULL
);

CREATE TABLE public_data_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);
INSERT INTO public_data_revision (id, revision) VALUES (1, 0);

CREATE TABLE public_sync_guard (
  expected_revision INTEGER NOT NULL
);

CREATE TRIGGER public_sync_guard_clear BEFORE INSERT ON public_sync_guard
WHEN EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN
  SELECT RAISE(ABORT, 'public_sync_guard already held');
END;

CREATE TRIGGER public_sync_guard_revision BEFORE INSERT ON public_sync_guard
WHEN NOT EXISTS (SELECT 1 FROM public_data_revision WHERE id = 1 AND revision = NEW.expected_revision)
BEGIN
  SELECT RAISE(ABORT, 'public_sync_guard revision changed');
END;

CREATE TRIGGER vehicles_public_revision_insert AFTER INSERT ON vehicles
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER vehicles_public_revision_update AFTER UPDATE ON vehicles
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER vehicles_public_revision_delete AFTER DELETE ON vehicles
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER vehicle_images_public_revision_insert AFTER INSERT ON vehicle_images
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER vehicle_images_public_revision_update AFTER UPDATE ON vehicle_images
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER vehicle_images_public_revision_delete AFTER DELETE ON vehicle_images
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER brand_aliases_public_revision_insert AFTER INSERT ON brand_aliases
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER brand_aliases_public_revision_update AFTER UPDATE ON brand_aliases
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER brand_aliases_public_revision_delete AFTER DELETE ON brand_aliases
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER site_settings_public_revision_insert AFTER INSERT ON site_settings
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER site_settings_public_revision_update AFTER UPDATE ON site_settings
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER site_settings_public_revision_delete AFTER DELETE ON site_settings
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER site_video_links_public_revision_insert AFTER INSERT ON site_video_links
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER site_video_links_public_revision_update AFTER UPDATE ON site_video_links
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER site_video_links_public_revision_delete AFTER DELETE ON site_video_links
WHEN NOT EXISTS (SELECT 1 FROM public_sync_guard)
BEGIN UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1; END;
