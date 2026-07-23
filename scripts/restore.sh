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
set -eu

export MYSQL_PWD="$DB_PASSWORD"
gunzip -c | mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME"
echo "Restore complete. Now run: docker compose restart api" >&2
