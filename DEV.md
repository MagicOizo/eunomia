# Developing Eunomia

Local development setup. For deploying/operating Eunomia see [README.md](README.md); for the
architecture, data model and slice-based roadmap see [Notes/eunomia-plan.md](Notes/eunomia-plan.md).

## Prerequisites

Node.js 24+ and Docker with Compose. The repo is an npm-workspaces monorepo:

- `apps/api` — Node/TypeScript + Express backend (raw SQL via the `mariadb` driver, `umzug` migrations)
- `apps/web` — Vue 3 + TypeScript + Vite SPA
- `packages/shared-types` — types shared between the two

```bash
npm install   # installs all workspace dependencies
```

## Run the whole app locally (one command)

```bash
npm run dev:up               # DB + migrations + seed (incl. dev admin) + API + web
```

This starts a MariaDB container, seeds demo data and a development admin, and runs both dev
servers with hot reload. When it's ready, open **http://localhost:5173** and log in with the
credentials it prints (default `admin@example.com` / `eunomia` — override via `DEV_ADMIN_EMAIL` /
`DEV_ADMIN_PASSWORD`). In WSL2, `localhost` forwards from Windows automatically, so the same URL
works in your Windows browser.

`Ctrl-C` stops the API and web servers; the database keeps running. To stop it too:

```bash
npm run dev:down             # stop the dev database (test data is kept)
npm run dev:down -- --wipe   # also delete the data volume (fresh start)
```

Everything here is development-only and self-contained: teardown removes only what `dev:up`
created (its container, network, and — with `--wipe` — its named volume). The dev servers use a
Vite dev proxy so the browser stays on one origin (`:5173`) and the httpOnly refresh cookie works.

To run the servers individually instead:

```bash
npm run dev:api              # apps/api with hot reload (tsx watch)
npm run dev:web              # apps/web with hot reload (Vite)
```

## Quality checks

```bash
npm run lint                 # ESLint across the whole repo
npm run typecheck            # tsc / vue-tsc, no emit
npm run test                  # backend (node:test) + frontend (vitest)
npm run build                 # production build of every workspace
```

The backend integration tests need a MariaDB and **skip** when no `DB_*` env is set, so
`npm run test` is runnable without a database (CI provides one). To run them against a database,
export `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` first.

## Migrations & seed data (by hand)

Migrations run automatically on API start; to drive them manually against a running MariaDB:

```bash
npm run migrate --workspace apps/api   # apply all pending migrations
npm run seed    --workspace apps/api   # demo data + dev admin (refuses NODE_ENV=production)
```

Both read the `DB_*` variables from the environment. The seed is idempotent — running it twice
does not duplicate rows.

## Production image (build locally / release)

Production hosts pull a pre-built image from GHCR (`ghcr.io/magicoizo/eunomia`, referenced in
`docker-compose.yml`). To build and run it locally instead — e.g. to test the production setup —
use the build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml build
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

Publishing is automated ([.github/workflows/docker.yml](.github/workflows/docker.yml)): every
push/PR builds the image (so a broken `Dockerfile` fails CI), and pushing a release tag publishes
the versioned image:

```bash
git tag v0.1.0 && git push origin v0.1.0   # -> ghcr.io/magicoizo/eunomia:0.1.0 + :latest
```

## Software Bill of Materials (SBOM)

Generate a [CycloneDX](https://cyclonedx.org/) SBOM on demand — none is committed to the repo,
since it would go stale the moment a dependency changes.

```bash
# Everything, including devDependencies, across all workspaces:
npm sbom --sbom-format cyclonedx

# Production only (apps/api runtime deps, matching the Docker image):
npm sbom --workspace apps/api --omit=dev --sbom-format cyclonedx
```

Add `> sbom.json` to save the output to a file.
