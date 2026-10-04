#!/bin/sh
# Streams a gzipped logical backup of the database to STDOUT. Runs INSIDE the
# api container, which already has the DB_* connection env and the mariadb
# client — so a production operator who only has docker-compose.yml + .env can
# redirect the output to a file on the host:
#
#   docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz
#
# What comes out is the complete case record in plain text: names, diagnoses'
# worth of invoice lines, amounts. The only secrets it cannot give away are the
# ones in the system settings, which stay encrypted with a key that lives in the
# environment and not in the dump. Encrypting the rest is the operator's job and
# belongs on the host, where the key is — see the "Backup & Restore" section of
# the README for the age/gpg pipe. This script deliberately knows no key.
#
# Uses the application DB user (not root) and a consistent InnoDB snapshot.
set -eu
# Without this, a failing mariadb-dump would still leave a valid gzip stream and
# a zero exit code: a truncated backup that looks like a good one.
set -o pipefail

export MYSQL_PWD="$DB_PASSWORD"
mariadb-dump --single-transaction --no-tablespaces \
  -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" | gzip
