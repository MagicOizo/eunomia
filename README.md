# Eunomia

Eunomia is a self-hosted web app for managing the private health-insurance (PKV) billing
process: tracking invoices from facilities (doctors, hospitals, pharmacies), submitting them to
an insurance company, recording the resulting reimbursement, and keeping tabs on deductible
thresholds and no-claims bonuses. It is built for home-lab operation, not as a public SaaS.

## Status

This repository is under active, from-scratch development. The full architecture, data model,
and slice-based implementation roadmap are documented in
[Notes/eunomia-plan.md](Notes/eunomia-plan.md); the sections below grow as each slice lands
rather than being restructured later. Currently implemented: the project scaffold (npm
workspaces for `apps/api`, `apps/web`, `packages/shared-types`; linting, formatting, tests,
Docker, CI) — no business features yet.

## Getting Started

Requires Node.js 24+ and Docker with Compose.

```bash
npm install                 # install all workspace dependencies

npm run dev:api              # apps/api with hot reload (tsx watch)
npm run dev:web               # apps/web with hot reload (Vite)

npm run lint                 # ESLint across the whole repo
npm run typecheck            # tsc / vue-tsc, no emit
npm run test                  # backend (node:test) + frontend (vitest)
npm run build                 # production build of every workspace
```

To run the containerized stack (API + MariaDB), copy `.env.example` to `.env`, fill in real
values, then:

```bash
docker compose up -d
```

The API is reachable at `http://localhost:3000` (`/` for a liveness check, `/api/v1/version`
for the running backend version — also shown in the frontend footer once it exists).

### Database migrations & seed data

Schema migrations run automatically when the API container starts, so `docker compose up -d`
always brings the database to the current schema version. To run them by hand (e.g. against a
locally running MariaDB during development):

```bash
npm run migrate --workspace apps/api   # apply all pending migrations
npm run seed    --workspace apps/api   # load anonymized dev data (refuses NODE_ENV=production)
```

Both read the `DB_*` variables from the environment. The seed is idempotent — running it twice
does not duplicate rows.

### First-run setup (creating the first admin)

There is no default admin account. On a fresh instance you create the first admin once, via a
one-time setup endpoint that only works while (a) no user exists yet and (b) the `SETUP_TOKEN`
from your `.env` is presented:

```bash
curl -X POST http://localhost:3000/api/v1/setup \
  -H 'Content-Type: application/json' \
  -H "X-Setup-Token: $SETUP_TOKEN" \
  -d '{"email":"you@example.com","password":"change-me-please","firstname":"Your name"}'
```

The created user gets the `Admin` role globally. Afterwards the endpoint returns `409` and you
can remove `SETUP_TOKEN` from `.env` to disable it entirely. Log in with:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"change-me-please"}'
```

The response body contains a short-lived `accessToken` (send it as `Authorization: Bearer …`);
a long-lived refresh token is set as an httpOnly cookie scoped to `/api/v1/auth`. Use
`POST /api/v1/auth/refresh` to obtain a new access token and `POST /api/v1/auth/logout` to
revoke the session.

## Environment Variables

All variables are read from `.env` (see `.env.example` for the template — never commit the real
`.env`).

| Variable                        | Purpose                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                      | `production` or `development`. In `production` the refresh-token cookie is marked Secure (HTTPS-only).       |
| `PORT`                          | Port the API listens on inside its container (also the host port mapping in `docker-compose.yml`).           |
| `DB_HOST` / `DB_PORT`           | Host and port the API uses to reach the database (`db` / `3306` in compose).                                 |
| `DB_USER` / `DB_PASSWORD`       | Credentials the API connects with — the dedicated application user, never root.                              |
| `DB_NAME`                       | Database/schema name the API connects to.                                                                    |
| `JWT_SECRET`                    | Secret signing the access-token JWTs. Long random string; rotating it invalidates all access tokens.        |
| `ACCESS_TOKEN_TTL_SECONDS`      | Access-token lifetime (default `900` = 15 min).                                                              |
| `REFRESH_TOKEN_TTL_SECONDS`     | Refresh-token lifetime (default `2592000` = 30 days).                                                        |
| `SETUP_TOKEN`                   | One-time token enabling `POST /api/v1/setup` for the first admin. Remove after setup to disable it.         |
| `MYSQL_ROOT_PASSWORD`           | Root password for the MariaDB container. Must be set explicitly — see the comment in `.env.example` for why. |
| `MYSQL_DATABASE`                | Database schema created on first MariaDB start (must equal `DB_NAME`).                                       |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Application database user created on first MariaDB start (must equal `DB_USER` / `DB_PASSWORD`).             |

## Updating

_Not yet available. Once a versioned release process exists, this section will describe how to
update a running instance to a newer version, including any required migration steps._

## Backup & Restore

_Not yet available. Once implemented, this section will describe how to trigger a database
backup and how to restore one, including migrating a restored backup to the current schema
version._

## Software Bill of Materials (SBOM)

Generate a [CycloneDX](https://cyclonedx.org/) SBOM on demand — none is committed to the repo,
since it would go stale the moment a dependency changes.

```bash
# Development (includes devDependencies, all workspaces):
npm sbom --sbom-format cyclonedx

# Production (apps/api runtime dependencies only, matching the Docker image):
npm sbom --workspace apps/api --omit=dev --sbom-format cyclonedx
```

Add `> sbom.json` to either command to save the output to a file.

## License

MIT — see [LICENSE](LICENSE).
