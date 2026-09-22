# Eunomia

Eunomia is a self-hosted web app for managing the private health-insurance (PKV) billing
process: tracking invoices from facilities (doctors, hospitals, pharmacies), submitting them to
an insurance company, recording the resulting reimbursement, and keeping tabs on deductible
thresholds and no-claims bonuses. It is built for home-lab operation, not as a public SaaS.

> **Developing Eunomia?** See [DEV.md](DEV.md) for the local development setup. The architecture,
> data model and implementation roadmap live in [Notes/eunomia-plan.md](Notes/eunomia-plan.md).

## Requirements

Docker with Compose. A TLS-terminating reverse proxy (e.g. Traefik) is recommended in front of
the app for real deployments.

## Deploy (single command)

Copy `.env.example` to `.env`, fill in real secrets, then:

```bash
docker compose up -d
```

This pulls a **pre-built, versioned image** from the GitHub Container Registry
(`ghcr.io/magicoizo/eunomia`) that serves **both the API and the Vue frontend**, alongside a
MariaDB container — no source checkout or local build needed, just this `docker-compose.yml` and
`.env`. Pin a release with `EUNOMIA_VERSION` in `.env` (defaults to `latest`). The whole app is
then reachable at `http://localhost:${PORT}` (default `3000`) — the SPA at `/`, the API under
`/api/v1`. Schema migrations run automatically on container start. Put the reverse proxy in front
for TLS; `TRUST_PROXY` makes rate limiting use the real client IP.

The database container is not published to the host (reachable only from the API on the compose
network) and is bootstrapped from the same `DB_*` values the API connects with — a dedicated
non-root application user with full rights on its own schema, defined once in `.env`. Nothing ever
connects as root (the API, migrations and the backup/restore scripts all use `DB_USER`), so the
container gets a throwaway random root password (`MARIADB_RANDOM_ROOT_PASSWORD`) that no human needs.

## First-run setup (creating the first admin)

There is no default admin account. On a fresh instance you create the first admin once, via a
one-time setup endpoint that only works while (a) no user exists yet and (b) the `SETUP_TOKEN`
from your `.env` is presented:

```bash
curl -X POST http://localhost:3000/api/v1/setup \
  -H 'Content-Type: application/json' \
  -H "X-Setup-Token: $SETUP_TOKEN" \
  -d '{"email":"you@example.com","password":"change-me-please","firstname":"Your name"}'
```

The created user gets the `Admin` role globally. Afterwards the endpoint returns `409`; remove
`SETUP_TOKEN` from `.env` to disable it entirely. From then on, manage users and their access from
the **System → Nutzer & Rechte** page in the app.

## Backup & Restore

The backup/restore scripts ship **inside the image** and run via `docker compose exec` — you only
need `docker-compose.yml` + `.env`. The dump streams to/from your host:

```bash
# Back up to a file on the host:
docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz

# Restore a dump, then restart so migrations run:
docker compose exec -T api /app/scripts/restore.sh < eunomia-2026-01-01.sql.gz
docker compose restart api
```

Restore brings an **older** backup up to the current schema (the API migrates on the restart). It
also works into a fresh instance: `docker compose up -d` on an empty database, then restore — the
db container creates the app user + schema, the dump recreates the tables + data, the API migrates
on restart. Keep the dump files on durable storage or copy them off-host.

## Updating

Set `EUNOMIA_VERSION` in `.env` to the new release (or keep `latest`), then pull and restart:

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on start, so the schema is brought up to date as part of the restart.
Take a backup first (see above).

### Updating to the policy model (migration 006)

Migration 006 turns contracts into stable policies with a premium history and yearly terms. It
**deletes** all existing contracts, submissions, service billings and allocations (master data and
invoices are kept; invoices become un-submitted and are re-assigned by hand). Export the old data
as CSV **before** updating — the running old image does not contain the script yet, so copy
`scripts/export-legacy-contracts.sh` from the repository onto the host first:

```bash
docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz
sh export-legacy-contracts.sh ./altdaten     # writes altdaten/policen.csv + altdaten/einreichungen.csv
docker compose pull && docker compose up -d
```

## Environment Variables

All variables are read from `.env` (see `.env.example` for the template — never commit the real
`.env`).

| Variable                    | Purpose                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production` or `development`. In `production` the refresh-token cookie is marked Secure (HTTPS-only).                                                      |
| `PORT`                      | Port the app listens on (also the host port mapping in `docker-compose.yml`).                                                                               |
| `DB_HOST` / `DB_PORT`       | Host and port the API uses to reach the database (`db` / `3306` in compose).                                                                                |
| `DB_USER` / `DB_PASSWORD`   | Credentials the API connects with — the dedicated application user, never root.                                                                             |
| `DB_NAME`                   | Database/schema name the API connects to.                                                                                                                   |
| `JWT_SECRET`                | Secret signing the access-token JWTs (≥32 chars, enforced in production; 64 recommended — `openssl rand -base64 64`). Rotating it invalidates all sessions. |
| `ACCESS_TOKEN_TTL_SECONDS`  | Access-token lifetime (default `900` = 15 min).                                                                                                             |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh-token lifetime (default `2592000` = 30 days).                                                                                                       |
| `SETUP_TOKEN`               | One-time token enabling `POST /api/v1/setup` for the first admin. Remove after setup to disable it.                                                         |
| `TRUST_PROXY`               | Proxy hops in front of the app so rate limiting uses the real client IP (default `1`).                                                                      |
| `RATE_LIMIT_*`              | Optional overrides for the auth / global rate limits (defaults in `.env.example`).                                                                          |

The MariaDB container is bootstrapped from `DB_NAME` / `DB_USER` / `DB_PASSWORD` (see
`docker-compose.yml`), so there are no separate `MYSQL_*` variables to set — root gets a random
password nobody uses.

## API reference

The API lives under `/api/v1` and (except for the version endpoint) requires a Bearer access
token. Successful responses use the envelope `{ "data": … }`; failures use
`{ "error": { code, message } }`. Entities are soft-deleted. Log in via
`POST /api/v1/auth/login` (returns a short-lived `accessToken` in the body; a long-lived refresh
token is set as an httpOnly cookie scoped to `/api/v1/auth`); use `POST /api/v1/auth/refresh` /
`/auth/logout` to renew or end the session.

**Master data**

| Resource            | Path                 | Access                                                           |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| Accounts            | `/api/v1/accounts`   | Account-scoped: users see/manage only accounts they are granted. |
| Contracts           | `/api/v1/contracts`  | Account-scoped via the contract's account.                       |
| Insurance companies | `/api/v1/companies`  | Any user may read; `MANAGE_COMPANIES` to change.                 |
| Facilities          | `/api/v1/facilities` | Any user may read; `MANAGE_FACILITIES` to change.                |
| Collection agencies | `/api/v1/agencies`   | Any user may read; `MANAGE_AGENCIES` to change.                  |

Each supports `GET /`, `GET /:uid`, `POST /`, `PATCH /:uid`, `DELETE /:uid`.

**Invoice workflow** (account-scoped via `VIEW_INVOICES` / `MANAGE_INVOICES`)

| Step                          | Endpoint                                                              |
| ----------------------------- | --------------------------------------------------------------------- |
| Record an invoice             | `POST /api/v1/invoices`                                               |
| Submit invoices to a policy   | `POST /api/v1/submissions` (batch, transactional)                     |
| Withdraw (no billing yet)     | `DELETE /api/v1/submissions/:uid/invoices/:invoiceUID`                |
| Record a billing              | `POST /api/v1/billings`                                               |
| Allocate a refund             | `POST /api/v1/allocations`                                            |
| Mark "not reimbursable under" | `POST /api/v1/invoices/:uid/exclusions` (and `DELETE …/:contractUID`) |
| Close / settle an invoice     | `PATCH /api/v1/invoices/:uid` (`reimbursementClosed`, `transferDate`) |

An invoice's status (`offen`, `eingereicht`, `teilabgerechnet`, `abgerechnet`, `erledigt`) is
**derived**, never stored: from its submissions, the refunds allocated to it over all policies,
the manual "billed" mark and whether it was paid. An invoice can be submitted to several policies
(e.g. the remainder to a supplementary insurance), but to each policy at most once and never to
one it is marked as not reimbursable under; an `allocation` may only link an invoice and a billing
of the same submission, and all refunds of an invoice together never exceed its amount.
`GET /api/v1/contracts/:uid/reimbursement-analysis?year=YYYY` runs the deductible/bonus/cap
calculation and reports whether submitting is worthwhile.

**Bonus & claim-free years** (per policy, `VIEW_CONTRACTS` / `MANAGE_CONTRACTS`): a policy's
yearly terms (`POST/PATCH /api/v1/contracts/:uid/terms`) carry its bonus scale (`bonusTiers`:
claim-free years → absolute amount). `GET /api/v1/contracts/:uid` returns the computed `years`:
claim-free streak and expected bonus per year, counted from the policy's start value, its forfeit
rule and each billing's `forfeitsBonus`. `PUT /api/v1/contracts/:uid/years/:year` records the
bonus actually paid and an optional "forfeited" override.

## License

MIT — see [LICENSE](LICENSE).
