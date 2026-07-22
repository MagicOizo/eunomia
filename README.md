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

## Environment Variables

All variables are read from `.env` (see `.env.example` for the template — never commit the real
`.env`).

| Variable                        | Purpose                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                      | `production` or `development`. Controls things like secure cookies once auth exists.                         |
| `PORT`                          | Port the API listens on inside its container (also the host port mapping in `docker-compose.yml`).           |
| `MYSQL_ROOT_PASSWORD`           | Root password for the MariaDB container. Must be set explicitly — see the comment in `.env.example` for why. |
| `MYSQL_DATABASE`                | Database schema created on first MariaDB start.                                                              |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Dedicated application database user (not root) created on first MariaDB start.                               |

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
