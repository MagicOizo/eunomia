# Build context is the repository root (see docker-compose.yml), because this
# is an npm workspace: the api package depends on the root package.json/
# package-lock.json and needs its workspace siblings' manifests present for
# `npm ci` to resolve correctly.

FROM node:24-alpine AS base
WORKDIR /app

# ---------- Dependencies (with devDependencies, for the build stage) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN npm ci

# ---------- Build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN npm run build --workspace apps/api

# ---------- Production-only dependencies ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN npm ci --omit=dev

# ---------- Production image ----------
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S eunomia -u 1001 -G nodejs

COPY --from=prod-deps --chown=eunomia:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=eunomia:nodejs /app/apps/api/dist ./apps/api/dist
COPY --chown=eunomia:nodejs apps/api/package.json ./apps/api/package.json
COPY --chown=eunomia:nodejs package.json ./package.json

USER eunomia
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000), r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
