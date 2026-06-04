ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN permissions INTEGER NOT NULL DEFAULT 0;
UPDATE admin_users
SET role = 'superadmin', permissions = 8191
WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1);
