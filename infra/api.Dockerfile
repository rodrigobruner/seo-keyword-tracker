# syntax=docker/dockerfile:1
#
# API image. One build, four runtime roles (api, worker, migrate, seed): the
# worker/migrate/seed are the same codebase under different entrypoints, so the
# compose file just overrides `command`. Multi-stage keeps the runtime lean.

# ---- build stage ------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Install with the lockfile for a reproducible build. npm ci validates every
# workspace manifest against package-lock.json, so all manifests must be present.
COPY package.json package-lock.json tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci

# Compile the api (tsc emits api/dist/src/** and api/dist/db/**).
COPY api ./api
RUN npm -w api run build \
  # tsc does not copy non-TS assets, but the runtime reads these from dist:
  #   migrate.js  -> dist/db/migrations/*.sql
  #   seed.js     -> dist/src/seed/seed-fixtures.json.gz (offline fallback)
  && cp -r api/db/migrations api/dist/db/migrations \
  && cp api/src/seed/seed-fixtures.json.gz api/dist/src/seed/seed-fixtures.json.gz \
  # Drop devDependencies so the runtime carries only what it runs.
  && npm prune --omit=dev

# ---- runtime stage ----------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/api/package.json ./api/package.json
COPY --from=build /app/api/dist ./api/dist

# Default role is the API. compose overrides `command` for worker/migrate/seed.
CMD ["node", "api/dist/src/index.js"]
