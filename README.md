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

### Which image tag to use

| Tag                | What it is                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `latest` (default) | the newest finished release — the tag to run in production                 |
| `X.Y.Z`            | exactly that release, pinned                                               |
| `X.Y.Z-slice.N`    | a preview published while a feature is being built; never becomes `latest` |
| `edge`             | the current state of `main`, unreleased and untested as a whole            |

A preview or a pinned version is fetched by setting `EUNOMIA_VERSION` in `.env`, e.g.
`EUNOMIA_VERSION=0.10.0-slice.1`. Previews are announced as GitHub pre-releases, so the update
notice in the footer keeps pointing at finished releases only.

### Knowing when there is something to update

The app asks GitHub every few hours whether a newer release exists and shows admins a link to the
release notes in the footer — nowhere else, and never to users who could not perform the update
anyway. A failed lookup shows nothing at all; the check is a convenience, not a health signal.

Because this repository is **private**, an anonymous request is answered with 404 and the notice
never appears. To switch it on, create a fine-grained personal access token with read-only
`Contents` access to this one repository and set `UPDATE_CHECK_TOKEN` in `.env`. To stop the
instance from contacting GitHub at all, set `UPDATE_CHECK_ENABLED=false`.

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

### Updating to a billing per policy (migration 011)

Migration 011 moves a Leistungsabrechnung from the submission to the policy and adds
`UNIQUE (contractUID, billingNumber)`. It **refuses to run** while one policy carries the same
billing number twice, naming the policy, the number and the count, rather than failing in the middle
of an `ALTER TABLE` or silently merging your data. Such pairs are likely: before this version, the
only way to record one insurer letter answering two submissions was to enter the letter twice.

Check first — this is read-only, and an empty result means the migration will pass:

```bash
docker compose exec -T api sh -c 'MYSQL_PWD="$DB_PASSWORD" mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" --table' <<'SQL'
SELECT s.contractUID, b.billingNumber, COUNT(*) AS n
  FROM ServiceBillings b
  JOIN Submissions s ON s.submissionUID = b.submissionUID
 WHERE b.billingStatus <> -1
 GROUP BY s.contractUID, b.billingNumber
HAVING n > 1
 ORDER BY s.contractUID, b.billingNumber;
SQL
```

If it returns rows, look at what those billings carry before deciding which one survives — the two
are one and the same letter, so the survivor takes over the other's reimbursements:

```bash
docker compose exec -T api sh -c 'MYSQL_PWD="$DB_PASSWORD" mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" --table' <<'SQL'
SELECT b.billingUID, b.billingNumber, b.billingDate, b.documentLink, b.forfeitsBonus,
       b.objectionDate, b.objectionResolvedDate, s.submissionUID, s.submittedDate
  FROM ServiceBillings b
  JOIN Submissions s ON s.submissionUID = b.submissionUID
 WHERE b.billingStatus <> -1 AND s.contractUID = '<contractUID>' AND b.billingNumber = '<number>';

SELECT a.billingUID, i.invoiceNumber, i.treatmentDate, a.reimbursement, a.receiptNumber
  FROM Allocations a
  JOIN Invoices i ON i.invoiceUID = a.invoiceUID
 WHERE a.billingUID IN ('<uid-a>', '<uid-b>') AND a.allocationStatus <> -1
 ORDER BY a.billingUID, i.treatmentDate;
SQL
```

**Which one to keep is decided by `forfeitsBonus`.** The bonus is judged per treatment year, and any
one claim that forfeits forfeits the whole year — so keeping the billing with `forfeitsBonus = 0`
would quietly stop that year from forfeiting. Keep the one with `1` where they differ. Watch the
treatment years while you are at it: if the invoices of the two billings fall into _different_ years,
the surviving flag now reaches a year it did not before, and that year needs a `ContractYears`
override (`bonusForfeited`) to keep its old outcome.

Then merge, in one transaction: move the reimbursements over and soft-delete the emptied billing,
which hands its number back (the unique key rides on a generated column that turns NULL for a
deleted billing). Nothing can collide — an invoice reaches each policy at most once, so the two
billings never share one.

```bash
docker compose exec -T api sh -c 'MYSQL_PWD="$DB_PASSWORD" mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME"' <<'SQL'
START TRANSACTION;
UPDATE Allocations     SET billingUID = '<keeper>'
 WHERE billingUID = '<loser>' AND allocationStatus <> -1;
UPDATE ServiceBillings SET billingStatus = -1 WHERE billingUID = '<loser>';
COMMIT;
SQL
```

Run the check again — it must come back empty — and then update. Do the merge **immediately** before
the update: in between, the surviving billing reimburses an invoice outside "its own" submission,
which the still-running old version cannot represent.

```bash
docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz
# check, inspect, merge, check again — then:
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
| `UPDATE_CHECK_ENABLED`      | Whether the instance may ask GitHub for the latest release (default `true`).                                                                                |
| `UPDATE_CHECK_TOKEN`        | Read-only GitHub token for the update check. Required while the repository is private; without it the check stays silent.                                   |
| `UPDATE_CHECK_REPO`         | Repository to read releases from (default `MagicOizo/eunomia`).                                                                                             |
| `UPDATE_CHECK_TTL_SECONDS`  | How long a successful lookup is reused before asking again (default `21600` = 6 h).                                                                         |

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

**Instance** — `GET /api/v1/version` reports the running version and needs no token (it doubles as
the container health check). `GET /api/v1/update-check` compares that version against the latest
GitHub release and needs `MANAGE_SETTINGS`; it answers
`{ current, latest, updateAvailable, releaseUrl, checkedAt, status }` with `status` one of `ok`,
`disabled` or `unavailable` — never an error, so an unreachable GitHub stays invisible in the UI.

## License

MIT — see [LICENSE](LICENSE).
