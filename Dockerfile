# syntax=docker/dockerfile:1

# ---------- Build stage: install all workspaces and build client + server ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# Build both packages (client -> client/dist, server -> server/dist).
COPY . .
RUN npm run build

# Prune dev dependencies so we can carry a lean node_modules into runtime.
RUN npm prune --omit=dev


# ---------- Runtime stage: slim image with exiftool + czkawka_cli ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/client/dist \
    CZKAWKA_BIN=/usr/local/bin/czkawka_cli \
    CZKAWKA_CACHE_PATH=/data/cache/czkawka \
    TRASH_DIR=/data/.trash \
    EXIFTOOL_BIN=exiftool

# exiftool (EXIF write-back) + libs czkawka_cli may dlopen for image formats.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libimage-exiftool-perl \
      ca-certificates \
      wget \
      libheif1 \
      libwebp7 \
    && rm -rf /var/lib/apt/lists/*

# czkawka_cli (deduplication engine). Pin the version; the Linux CLI is a single
# prebuilt binary published on the project's GitHub releases.
# `set -eux` + the --version smoke test make the build FAIL if the download is
# missing/corrupt or the binary can't execute (e.g. a missing shared library),
# instead of silently shipping an image without a working deduper.
ARG CZKAWKA_VERSION=9.0.0
RUN set -eux; \
    wget -O /usr/local/bin/czkawka_cli \
      "https://github.com/qarmin/czkawka/releases/download/${CZKAWKA_VERSION}/linux_czkawka_cli"; \
    chmod +x /usr/local/bin/czkawka_cli; \
    /usr/local/bin/czkawka_cli --version

# Application artifacts.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json

LABEL org.opencontainers.image.licenses="MIT"

VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:8080/api/health || exit 1
CMD ["node", "server/dist/server.js"]
