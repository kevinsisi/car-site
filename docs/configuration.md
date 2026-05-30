# Configuration

Set these environment variables in the runtime environment. Do not commit local `.env` files.

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite file path. Defaults to `./data/car-site.db`. |
| `SESSION_SECRET` | Long random secret used to sign admin sessions. |
| `IMPORT_API_TOKEN` | Bearer token accepted by the `sheet-to-car` import API. |
| `ADMIN_USERNAME` | Initial admin username for seeding. Defaults to `admin`. |
| `ADMIN_PASSWORD` | Initial admin password for seeding. Change before production. |
