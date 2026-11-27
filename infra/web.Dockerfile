# syntax=docker/dockerfile:1
#
# Web image. The SPA is built to static files and served by nginx, which also
# proxies /api to the api service so the browser stays same-origin (the session
# cookie is httpOnly + SameSite=Lax). This mirrors the Vite dev proxy.

# ---- build stage ------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY web ./web
RUN npm -w web run build   # outputs web/dist

# ---- runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
