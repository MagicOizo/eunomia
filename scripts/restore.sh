#!/bin/sh
# Restores a gzipped backup read from STDIN into the database. Runs INSIDE the
# api container:
#
#   docker compose exec -T api /app/scripts/restore.sh < eunomia-2026-01-01.sql.gz
#
# The dump recreates the tables + data (works into a fresh instance too, since
# the db container creates the schema + app user on first start). Afterwards
# restart the API so migrations bring an older backup up to the current schema:
#
#   docker compose restart api
#
# An encrypted backup is decrypted on the host and piped in from there (see the
# README) — this script expects the gzipped dump itself.
set -eu
# Without this, input that is not a gzipped dump — an encrypted file piped in
# by mistake — would fail in gunzip while the exit code came from mariadb, and
# the script would report a restore that never happened.
set -o pipefail

export MYSQL_PWD="$DB_PASSWORD"
gunzip -c | mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME"
echo "Restore complete. Now run: docker compose restart api" >&2
