#!/usr/bin/env bash
#
# Fills the local development database with the seed dataset, without starting
# the dev servers. With --reset it first deletes every application row, so the
# test data that piled up while clicking around is gone and the database holds
# exactly the seed set again:
#
#   npm run dev:seed     # add the seed rows (repeat runs change nothing)
#   npm run dev:reset    # wipe everything, then seed
#
# Never touches production: the DB_* values below point at the dev container,
# and the seed itself refuses to run with NODE_ENV=production.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export NODE_ENV=development
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=eunomia DB_PASSWORD=eunomia DB_NAME=eunomia
export DEV_ADMIN_EMAIL="${DEV_ADMIN_EMAIL:-admin@example.com}"
export DEV_ADMIN_PASSWORD="${DEV_ADMIN_PASSWORD:-eunomia}"

if ! docker inspect -f '{{.State.Running}}' eunomia-dev-db >/dev/null 2>&1; then
  echo "Die Dev-Datenbank läuft nicht — starte sie mit 'npm run dev:up'." >&2
  exit 1
fi

npm run seed --workspace apps/api -- "$@"
