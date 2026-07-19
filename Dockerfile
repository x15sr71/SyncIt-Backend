# syntax=docker/dockerfile:1

# ── Build stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate` (needs the schema copied above)
RUN npm ci

COPY src ./src
RUN npm run build
# Keep only production deps for the runtime image (the esbuild bundle
# externalizes @prisma/adapter-pg, which needs real node_modules).
RUN npm prune --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# curl for the container healthcheck
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./

USER node

ENV PORT=3002
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# unhandledRejection intentionally exits the process — run under a
# supervisor with restart (compose: restart: unless-stopped).
CMD ["node", "dist/backend/server.js"]
