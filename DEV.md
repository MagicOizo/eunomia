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
npm run format               # Prettier: format the whole repo (format:check only checks)
npm run lint                 # ESLint across the whole repo
npm run typecheck            # tsc / vue-tsc, no emit
npm run test                  # backend (node:test) + frontend (vitest)
npm run build                 # production build of every workspace
```

The backend integration tests need a MariaDB and **skip** when no `DB_*` env is set, so
`npm run test` is runnable without a database (CI provides one). To run them against a database,
export `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` first.

Code is always Prettier-formatted, and CI fails on unformatted files. `npm install` installs a
pre-commit hook (husky + lint-staged) that runs `eslint --fix` and `prettier --write` on the staged
files only. `git commit --no-verify` skips it in an emergency. Formatting drift is fixed in its own
commit, whose hash goes into `.git-blame-ignore-revs`. To have local `git blame` skip those commits:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Seed data & resetting the dev database

The seed fills the database with a dataset built for clicking through the app: every workflow
status, both payment traffic lights, an invoice at two policies, an open objection, a correction
booked from a second billing, a policy whose bonus scale was not updated, a cancelled policy that
expired during the current year (so the submit dialog has an expired one to hide behind its switch),
an insured person without a policy, a parent/child family policy settled by one insurer letter —
and, as `Clara Beispiel`, the author's three example years from `Notes/eunomia-plan.md` (2.3), so
the reimbursement optimizer can be checked against its reference table in the running app.
Treatment years are relative to today, so the current year always carries data.

```bash
npm run dev:seed    # add the seed rows to the dev database
npm run dev:reset   # delete every application row first, then seed
```

`dev:reset` is the way to get rid of whatever piled up while testing. Both scripts target the dev
container only and refuse to run with `NODE_ENV=production`; the seed is idempotent, so repeating
it without `--reset` changes nothing.

## Migrations (by hand)

Migrations run automatically on API start; to drive them manually against a running MariaDB:

```bash
npm run migrate    --workspace apps/api   # apply all pending migrations
npm run seed       --workspace apps/api   # seed against the DB_* env vars
npm run seed:reset --workspace apps/api   # the same, wiping the data first
```

These read the `DB_*` variables from the environment.

> **The API integration tests delete all data.** Point them at their own database, never at the
> dev one: `DB_NAME=eunomia_test npm run test --workspace apps/api` (CI does the same).

## System settings & mail

Everything under **System > Settings** lives in the database, not in `.env`: an admin changes it
without shell access. Values the database must not hold in the clear — the SMTP password and the
GitHub token for the update check — are encrypted with `CONFIG_ENCRYPTION_KEY` (AES-256-GCM, see
`apps/api/src/lib/secret-box.ts`), which stays in the environment. Generate one per instance:

```bash
openssl rand -base64 32
```

Without the key the app still starts and everything but those two secrets works; the settings page
says so rather than failing silently. **Changing the key makes the stored secrets unreadable** —
they have to be entered again. `npm run dev:up` exports a fixed dev key, so no setup is needed
locally.

The update check reads the token from the settings first and falls back to `UPDATE_CHECK_TOKEN`.
A successful answer is cached for six hours (`UPDATE_CHECK_TTL_SECONDS`), a failed one for fifteen
minutes; **Check now** on the settings page bypasses the cache. The repository is private, so
without a token GitHub answers 404 and the footer stays silent by design — the settings page names
that reason.

### Finding mail problems in the log

Mail events are one line each, with a fixed `event=` token (`apps/api/src/lib/log.ts`), so they can
be filtered instead of read:

```bash
docker logs eunomia 2>&1 | grep MAIL_SEND_FAILED   # a rejected or unreachable mail server
docker logs eunomia 2>&1 | grep MAIL_SEND_OK       # successful sends
docker logs eunomia 2>&1 | grep MAIL_NOT_CONFIGURED        # switched off or incomplete
docker logs eunomia 2>&1 | grep SETTINGS_SECRET_UNREADABLE # wrong/missing CONFIG_ENCRYPTION_KEY
docker logs eunomia 2>&1 | grep REMINDERS_RUN     # one line per reminder run, with its counts
docker logs eunomia 2>&1 | grep REMINDERS_SKIPPED # a run that found mail switched off
docker logs eunomia 2>&1 | grep -E 'eunomia event=' # every event line
```

A failure line carries the recipient, the host, the mail server's error code and its message — never
a password. The settings page shows the same message next to the red status, and it survives a
restart (it is stored with the settings).

### Payment reminders

The only thing the API does without being asked. A timer wakes every five minutes and runs the
reminders once the configured hour has arrived in the configured time zone, using
`reminders.lastRunAt` as its watermark — so a window missed while the machine was off is caught up
at the next tick rather than skipped until tomorrow. It lives in `src/index.ts`, not in
`createApp()`, so no test suite ever starts sending in the background.

Each recipient hears only about the invoices they may see. A due invoice is announced once; an
overdue one repeats every `reminders.repeatDays` days. What counts as "due" is not configurable: it
is the same ten-day window as the traffic light in the invoice list
(`apps/api/src/reminders/payment.ts` and `apps/web/src/invoices/payment.ts` — change one, change the
other).

On the settings page, **Vorschau** renders what would go out without sending or remembering
anything, and **Jetzt ausführen** does it for real. With the reminders switched off both answer 409
rather than quietly mailing everyone.

## Production image (build locally / release)

Production hosts pull a pre-built image from GHCR (`ghcr.io/magicoizo/eunomia`, referenced in
`docker-compose.yml`). To build and run it locally instead — e.g. to test the production setup —
use the build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml build
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

Publishing is automated ([.github/workflows/docker.yml](.github/workflows/docker.yml)): every
push/PR builds the image (so a broken `Dockerfile` fails CI), a push to `main` publishes `:edge`,
and pushing a version tag publishes the versioned image and then creates the GitHub release from
`CHANGELOG.md`.

## Versioning a change

The rules live in `Notes/eunomia-plan.md` §2.9: a **minor** per finished feature, a **patch** only
for a hotfix on a released version, and `X.Y.Z-slice.N` while a feature is still being built. One
command moves the number through all four `package.json` files and `package-lock.json`:

```bash
npm run version:next -- slice   # 0.9.0 -> 0.10.0-slice.1, then -slice.2, …
npm run version:next -- minor   # 0.10.0-slice.4 -> 0.10.0 (feature finished)
npm run version:next -- patch   # 0.10.0 -> 0.10.1 (hotfix on a release)
npm run version:set -- 1.0.0    # any version, explicitly
npm run version:check           # workspaces, lockfile and CHANGELOG.md agree (also runs in CI)
```

The bump belongs in the commit it describes, together with its `CHANGELOG.md` section — the release
workflow refuses a tag whose version has no section, and `version:check` fails the build before
that. Then tag the commit and push:

```bash
git tag -a v0.10.0-slice.1 -m "v0.10.0-slice.1" && git push --follow-tags
```

A tag with a pre-release part (`-slice.1`) publishes an image plus a GitHub **pre-release** and
leaves `:latest` alone; a final tag (`v0.10.0`) moves `:latest` and publishes a full release, which
is what the in-app update check shows to admins.

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
