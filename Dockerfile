FROM node:20-bookworm AS build

ARG ALLOW_INSECURE_TLS=0
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

WORKDIR /app

COPY package.json package-lock.json ./
# Stage 1: install JS deps only, skip postinstall (avoids native build OOM during ci)
RUN if [ "$ALLOW_INSECURE_TLS" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; npm config set strict-ssl false; fi; npm ci --ignore-scripts --no-audit --no-fund
# Stage 2: build native binding for better-sqlite3 separately
RUN if [ "$ALLOW_INSECURE_TLS" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; npm rebuild better-sqlite3

COPY . .
RUN if [ "$ALLOW_INSECURE_TLS" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; npm run build
RUN if [ "$ALLOW_INSECURE_TLS" = "1" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/src/db/migrate.ts ./src/db/migrate.ts
COPY --from=build /app/src/db/seed.ts ./src/db/seed.ts
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/src/db/connection.ts ./src/db/connection.ts
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "./scripts/docker-entrypoint.mjs"]
