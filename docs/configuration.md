# Configuration

Set these environment variables in the runtime environment. Do not commit local `.env` files.

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite file path. Defaults to `./data/car-site.db`. |
| `SESSION_SECRET` | Long random secret used to sign admin sessions. |
| `IMPORT_API_TOKEN` | Bearer token accepted by the `sheet-to-car` import API. |
| `ADMIN_USERNAME` | Initial admin username for seeding. Defaults to `admin`. |
| `ADMIN_PASSWORD` | Initial admin password for seeding. Change before production. |

## Admin Site Settings

Most public-site display settings are managed from the admin dashboard instead of environment variables.

Use `Admin -> Website Settings` to configure the browser tab icon. Upload a square PNG, WebP, JPEG, or GIF image; 256x256 or larger is recommended. The uploaded image is saved through the admin media API and stored as `siteIconUrl` in site settings.

If no custom site icon is uploaded, the app serves `/site-icon.svg` as a theme-aware default favicon. The default icon uses the current public theme colors and the first character of the configured site name, so the site always has a browser tab icon.

The site icon is emitted in the public layout, admin layout, and admin login page. Custom uploaded icons also emit an `apple-touch-icon` link.
