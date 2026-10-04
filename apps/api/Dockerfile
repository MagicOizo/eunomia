# Build context is the repository root (see docker-compose.yml), because this
# is an npm workspace: the api package depends on the root package.json/
# package-lock.json and its workspace siblings' manifests for `npm ci`. The one
# image builds both the API and the Vue SPA and serves the SPA itself.

FROM node:24-alpine AS base
WORKDIR /app

# ---------- Install all workspace deps (incl. dev, for building) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci

# ---------- Build the API and the SPA ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
# The shared package first: both apps compile against its declarations, and the
# API imports its compiled output at runtime (see packages/shared/src/index.ts).
RUN npm run build --workspace packages/shared \
  && npm run build --workspace apps/api \
  && npm run build --workspace apps/web

# ---------- Production-only dependencies (API runtime) ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# Only what the API itself runs. A plain `npm ci --omit=dev` installs the
# *runtime* dependencies of every workspace, so the image carried vue, pinia,
# vue-router, @fortawesome/* and qrcode as well — and nothing in the container
# ever executes them, because the SPA is a static bundle built in the stage
# above. They also dragged two known vulnerabilities into the image
# (postcss and nanoid, via vue -> @vue/compiler-sfc).
# The web workspace's manifest is still copied: npm ci checks the lockfile
# against every workspace. The link it leaves behind points at a directory
# this stage does not have, so it goes.
RUN npm ci --omit=dev -w apps/api --include-workspace-root \
  && rm -f node_modules/@eunomia/web

# ---------- Production image ----------
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S eunomia -u 1001 -G nodejs

# mariadb client for the in-container backup/restore scripts (see scripts/).
RUN apk add --no-cache mariadb-client

COPY --from=prod-deps --chown=eunomia:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=eunomia:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=eunomia:nodejs /app/apps/web/dist ./apps/web/dist
# node_modules/@eunomia/shared is a symlink into packages/shared, so the package
# has to be here too — its manifest for the resolver, its dist for the code.
COPY --from=build --chown=eunomia:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --chown=eunomia:nodejs packages/shared/package.json ./packages/shared/package.json
COPY --chown=eunomia:nodejs apps/api/package.json ./apps/api/package.json
COPY --chown=eunomia:nodejs package.json ./package.json
COPY --chown=eunomia:nodejs scripts/backup.sh scripts/restore.sh ./scripts/
RUN chmod +x scripts/backup.sh scripts/restore.sh

USER eunomia
EXPOSE 3000

# The JSON version endpoint is the liveness target ('/' serves the SPA).
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/api/v1/version', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
