CREATE INDEX IF NOT EXISTS vehicle_images_vehicle_cover_sort_id_idx
  ON vehicle_images(vehicle_id, is_cover DESC, sort_order ASC, id ASC);

CREATE INDEX IF NOT EXISTS vehicle_images_vehicle_sort_id_idx
  ON vehicle_images(vehicle_id, sort_order ASC, id ASC);
