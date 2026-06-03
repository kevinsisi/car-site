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

## Vehicle Listing Filters

The public `/cars` listing separates active inventory from sold records.

- `全部`, brand filters, and `本月精選` show only active public inventory statuses: `published`, `incoming`, `reserved`, `special`, and `unknown`.
- Sold vehicles are not mixed into `全部` or brand filters.
- The brand filter drawer includes a fixed bottom entry named `成交實錄`; it links to `/cars?tab=sold` and shows only `sold` vehicles when `公開網頁顯示已售出車輛` is enabled.
- The drawer itself is collapsed by default on both desktop and mobile. The page shows one trigger button (`品牌列表`, the selected brand, `本月精選`, or `成交實錄`) and opens the full list only after the user taps it.
- On mobile, `/cars` keeps a sticky search/filter bar visible. Scrolling down collapses the hero and toolbar so only search/filter remains; scrolling up restores the full listing header.

## Sold Case Display

Homepage sold cases are curated separately from the sold-records listing.

- The admin setting `公開網頁顯示已售出車輛` is the global public gate for sold vehicles. When it is off, sold vehicles do not appear in `成交實錄`, homepage `成交案例`, or public detail pages.
- Each vehicle has an admin checkbox named `顯示於成交案例`.
- The homepage `成交案例` section only includes vehicles where `status = sold`, `show_sold_case = true`, and public sold vehicle display is enabled.
- The database column is `vehicles.show_sold_case`, added by migration `0006_sold_case_display.sql`.
- The default is `false`, so imported or existing sold vehicles do not automatically appear on the homepage.

## Detail Page Images

Detail pages use one lightbox for both the hero cover and the full gallery.

- The top cover image is a lightbox trigger.
- Gallery images use the same `data-gallery-index` flow.
- Photos remain uncropped with `object-fit: contain`.
