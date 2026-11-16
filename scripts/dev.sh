#!/usr/bin/env bash
#
# One-command local dev environment: starts the MariaDB container, applies
# migrations + seed data (including a dev admin), then runs the API and web
# dev servers with hot reload. Ctrl-C stops the API and web servers; the
# database keeps running (stop it with `npm run dev:down`).
#
# All config here is DEVELOPMENT-ONLY and deliberately non-secret.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE=(docker compose -f docker-compose.dev.yml)

export NODE_ENV=development
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=eunomia DB_PASSWORD=eunomia DB_NAME=eunomia
export JWT_SECRET=dev-only-not-a-real-secret
export SETUP_TOKEN=dev-setup
export PORT=3000
# Generous auth rate limit in dev — repeated logins from you and from browser
# tooling share one IP bucket, and the strict prod default (10/15 min) would
# otherwise lock you out with a 429.
export RATE_LIMIT_AUTH_MAX=1000
# Fixed dev key for the secrets in the system settings (SMTP password, GitHub
# token). Constant on purpose: a random one per start would make every stored
# secret unreadable after a restart. Never use it anywhere but here.
export CONFIG_ENCRYPTION_KEY="ZGV2LW9ubHkta2V5LW5vdC1hLXJlYWwtc2VjcmV0MDA="
export DEV_ADMIN_EMAIL="${DEV_ADMIN_EMAIL:-admin@example.com}"
export DEV_ADMIN_PASSWORD="${DEV_ADMIN_PASSWORD:-eunomia}"

echo "▶ Datenbank starten…"
"${COMPOSE[@]}" up -d

printf "▶ Warte auf die Datenbank"
until [ "$(docker inspect -f '{{.State.Health.Status}}' eunomia-dev-db 2>/dev/null || echo starting)" = "healthy" ]; do
  printf "."
  sleep 1
done
echo " ✓"

# The apps import @eunomia/shared as a compiled package; tsx and Vite resolve it
# through its dist, and neither watches node_modules. So it is built once here —
# whoever edits the package rebuilds it (see DEV.md).
echo "▶ Geteiltes Paket bauen…"
npm run build --workspace packages/shared

echo "▶ Migration + Seed (inkl. Dev-Admin)…"
npm run seed --workspace apps/api

# A sign-in provider behind a private CA: Node trusts only the public CAs, so
# the API needs the CA certificate through NODE_EXTRA_CA_CERTS. Exported by the
# caller, it reaches the API as it is; checked here because Node only warns
# about a missing file once, deep in the log.
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ ! -r "$NODE_EXTRA_CA_CERTS" ]; then
  echo "⚠ NODE_EXTRA_CA_CERTS zeigt auf keine lesbare Datei: $NODE_EXTRA_CA_CERTS"
fi

echo ""
echo "───────────────────────────────────────────────"
echo "  Web-App:  http://localhost:5173"
# Extra host names (DEV_HOSTS, comma-separated) that Vite lets through.
IFS=',' read -ra dev_hosts <<<"${DEV_HOSTS:-}"
for host in "${dev_hosts[@]}"; do
  host="${host// /}"
  if [ -n "$host" ]; then echo "            http://${host}:5173"; fi
done
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; then echo "  Eigene CA: ${NODE_EXTRA_CA_CERTS}"; fi
echo "  Login:    ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}"
echo "  (Strg-C beendet API + Web; DB läuft weiter)"
echo "───────────────────────────────────────────────"
echo ""

# Kill the whole process group (API + web) when this script exits.
trap 'kill 0' EXIT
npm run dev --workspace apps/api &
npm run dev --workspace apps/web -- --host &
wait
