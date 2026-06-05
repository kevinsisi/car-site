# AMD64 CI/CD

This repository deploys `main` to the amd64 `car-site-mita` host through GitHub Actions.

## Flow

1. Push to `main`.
2. `docker-publish.yml` builds `linux/amd64` from `Dockerfile`.
3. The image is pushed to Docker Hub as `kevin950805/car-site:latest` by default.
4. `deploy-amd64.yml` connects to the host over Tailscale SSH.
5. The workflow syncs `docker-compose.yml`, runs `docker compose pull`, recreates `car-site-mita`, and checks `/health`.

## Required GitHub Secrets

- `DOCKERHUB_TOKEN`
- `DOCKERHUB_USERNAME` optional; defaults to `kevin950805`
- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`
- `DEPLOY_SSH_KEY`
- `DEPLOY_SERVER_IP`, for example `100.73.52.37`
- `DEPLOY_USER`, for example `kevin`
- `DEPLOY_PATH`, for example `/home/kevin/DockerCompose/car-site-mita`
- `DEPLOY_PORT` optional; defaults to `5325`

## Host `.env`

Keep runtime secrets on the host in `${DEPLOY_PATH}/.env`. The deploy workflow does not write `.env`.

Typical values:

```env
SESSION_SECRET=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
IMPORT_API_TOKEN=...
CAR_SITE_HOST_BIND=100.73.52.37:5325
CAR_SITE_DATA_DIR=/srv/data4tb/car-site-mita/data
CAR_SITE_IMAGE=kevin950805/car-site:latest
```

`CAR_SITE_DATA_DIR` stores SQLite and media files and must be persistent.
