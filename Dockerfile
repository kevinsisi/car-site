FROM node:22-bookworm AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/src/db/migrate.ts ./src/db/migrate.ts
COPY --from=build /app/src/db/seed.ts ./src/db/seed.ts
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/src/db/connection.ts ./src/db/connection.ts
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "./dist/server/entry.mjs"]
