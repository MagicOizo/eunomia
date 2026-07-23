#!/usr/bin/env bash
#
# Tears down the local dev environment started by scripts/dev.sh. Only removes
# what dev.sh created: the dev database container/network and any stray API/web
# dev servers. The named data volume is kept by default so your test data
# survives; pass --wipe to delete it too.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "▶ Dev-Server beenden (falls noch aktiv)…"
pkill -f 'tsx watch src/index.ts' 2>/dev/null || true
pkill -f 'apps/web' 2>/dev/null || true

if [ "${1:-}" = "--wipe" ]; then
  echo "▶ Datenbank + Daten-Volume entfernen…"
  docker compose -f docker-compose.dev.yml down -v
  echo "✓ Alles entfernt (inkl. Testdaten)."
else
  echo "▶ Datenbank stoppen (Daten bleiben erhalten)…"
  docker compose -f docker-compose.dev.yml down
  echo "✓ Gestoppt. Testdaten bleiben erhalten (mit '--wipe' auch die löschen)."
fi
