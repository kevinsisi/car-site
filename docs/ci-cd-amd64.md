# AMD64 CI/CD

This repository deploys `main` to the amd64 `car-site-mita` host through GitHub Actions.

## Flow

1. Push to `main`.
2. `deploy-amd64.yml` connects to the amd64 host over Tailscale SSH.
3. The workflow syncs `docker-compose.yml` and a source archive.
4. The amd64 host builds `car-site-mita:local` from `Dockerfile`.
5. The workflow recreates `car-site-mita` with Docker Compose and checks `/health`.

## Required GitHub Secrets

- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`
- `DEPLOY_SSH_KEY`
- `DEPLOY_SERVER_IP`, for example `100.73.52.37`
- `DEPLOY_USER`, for example `kevin`
- `DEPLOY_PATH`, for example `/home/kevin/DockerCompose/car-site-mita`
- `DEPLOY_PORT` optional; defaults to `5325`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_USERNAME` optional; defaults to `admin`
- `IMPORT_API_TOKEN` optional
- `CAR_SITE_HOST_BIND` optional; defaults to `100.73.52.37:5325`
- `CAR_SITE_DATA_DIR` optional; defaults to `/srv/data4tb/car-site-mita/data`

## Runtime Secrets

The deploy workflow does not require or write a host `.env` file. Runtime secrets are injected into `docker compose` from GitHub Secrets during deployment.

Equivalent runtime values:

```env
SESSION_SECRET=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
IMPORT_API_TOKEN=...
CAR_SITE_HOST_BIND=100.73.52.37:5325
CAR_SITE_DATA_DIR=/srv/data4tb/car-site-mita/data
CAR_SITE_IMAGE=car-site-mita:local
```

`CAR_SITE_DATA_DIR` stores SQLite and media files and must be persistent.
