#!/bin/sh
# Streams a gzipped logical backup of the database to STDOUT. Runs INSIDE the
# api container, which already has the DB_* connection env and the mariadb
# client — so a production operator who only has docker-compose.yml + .env can
# redirect the output to a file on the host:
#
#   docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz
#
# Uses the application DB user (not root) and a consistent InnoDB snapshot.
set -eu

export MYSQL_PWD="$DB_PASSWORD"
mariadb-dump --single-transaction --no-tablespaces \
  -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" | gzip
