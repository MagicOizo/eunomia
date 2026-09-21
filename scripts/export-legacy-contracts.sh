#!/bin/sh
# One-off export of the pre-v3 contract data as CSV (see Notes/eunomia-plan.md,
# Slice 16). Migration 006 deletes all contracts, submissions, service billings
# and allocations because the policy model changes (they are re-entered by
# hand) — this script saves them beforehand as a readable template.
#
# Runs on the HOST, in the directory holding the production docker-compose.yml
# and .env. The currently running (old) image does not ship this script, so
# copy it onto the host first. Update order:
#
#   1. docker compose exec -T api /app/scripts/backup.sh > eunomia-$(date +%F).sql.gz
#   2. sh export-legacy-contracts.sh [output-dir]      # this script
#   3. docker compose pull && docker compose up -d     # new version, runs migration 006
#
# Output (semicolon-separated, UTF-8 with BOM, German number/date format, so it
# opens directly in Excel/LibreOffice):
#   <output-dir>/policen.csv        one row per contract (incl. inactive ones)
#   <output-dir>/einreichungen.csv  one row per submitted invoice x service billing
#
# The SQL is piped into the mariadb client inside the api container, using the
# same DB_* credentials as backup.sh. Set EXPORT_SQL_RUNNER to any command that
# reads SQL on stdin and prints raw rows without headers to use another
# connection (e.g. the local dev database).
set -eu

OUT_DIR="${1:-.}"
mkdir -p "$OUT_DIR"

run_sql() {
  if [ -n "${EXPORT_SQL_RUNNER:-}" ]; then
    # Intentionally unquoted: the variable holds a command with arguments.
    # shellcheck disable=SC2086
    $EXPORT_SQL_RUNNER
  else
    docker compose exec -T api sh -c \
      'MYSQL_PWD="$DB_PASSWORD" mariadb -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" --batch --raw --skip-column-names'
  fi
}

# Writes the BOM + header line, then the query rows, to the given file.
export_csv() {
  file="$1"
  header="$2"
  query="$3"
  {
    printf '\357\273\277%s\r\n' "$header"
    printf '%s\n' "$query" | run_sql | sed 's/$/\r/'
  } > "$file"
  rows=$(($(wc -l < "$file") - 1))
  echo "✓ $file ($rows Zeilen)" >&2
}

# SQL fragments. q() quotes a text value for CSV, eur() formats money with a
# decimal comma, de() formats a date as dd.mm.yyyy.
q() { printf "CONCAT('\"', REPLACE(IFNULL(%s, ''), '\"', '\"\"'), '\"')" "$1"; }
eur() { q "FORMAT($1, 2, 'de_DE')"; }
de() { q "DATE_FORMAT($1, '%d.%m.%Y')"; }
person() { printf "CONCAT_WS(' ', %s.firstname, %s.middlename, %s.surname)" "$1" "$1" "$1"; }

export_csv "$OUT_DIR/policen.csv" \
  'Vertragsnummer;Versicherter;Versicherung;Beginn;Ende;Selbstbeteiligung;Erstattungsobergrenze;Monatsbeitrag;Bonus;Status' \
  "SELECT CONCAT_WS(';',
     $(q 'c.contractNumber'), $(q "$(person a)"), $(q 'v.companyName'),
     $(de 'c.contractBegin'), $(de 'c.contractEnd'),
     $(eur 'c.deductible'), $(eur 'c.reimbursementCap'), $(eur 'c.monthlyRate'), $(eur 'c.bonus'),
     $(q "CASE c.contractStatus WHEN 1 THEN 'aktiv' WHEN 0 THEN 'inaktiv' ELSE 'gelöscht' END"))
   FROM Contracts c
   JOIN Accounts a ON a.accountUID = c.accountUID
   JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
   WHERE c.contractStatus <> -1
   ORDER BY a.firstname, c.contractNumber, c.contractBegin;"

# Invoices of active submissions, joined to the billings they were allocated
# to; billings of a submission without any allocation are appended so no
# recorded Leistungsabrechnung is lost.
objection="CASE
  WHEN b.objectionDate IS NULL THEN ''
  WHEN b.objectionResolvedDate IS NULL THEN CONCAT('offen seit ', DATE_FORMAT(b.objectionDate, '%d.%m.%Y'))
  ELSE CONCAT('erledigt ', DATE_FORMAT(b.objectionResolvedDate, '%d.%m.%Y'))
END"
objection_text="CONCAT_WS(': ', NULLIF($objection, ''), b.objectionNote)"

export_csv "$OUT_DIR/einreichungen.csv" \
  'Einreichungsdatum;Vertragsnummer;Versicherter;Rechnungsnummer;Rechnungsdatum;Behandlungsdatum;Leistungserbringer;Rechnungsbetrag;Abrechnungsnummer;Abrechnungsdatum;Belegnummer;Erstattung;Widerspruch' \
  "SELECT line FROM (
     SELECT s.submittedDate AS sortDate, c.contractNumber AS sortContract, i.invoiceDate AS sortInvoice,
       CONCAT_WS(';',
         $(de 's.submittedDate'), $(q 'c.contractNumber'), $(q "$(person a)"),
         $(q 'i.invoiceNumber'), $(de 'i.invoiceDate'), $(de 'i.treatmentDate'), $(q 'f.facilityName'),
         $(eur 'i.invoiceAmount'), $(q 'b.billingNumber'), $(de 'b.billingDate'),
         $(q 'al.receiptNumber'), $(eur 'al.reimbursement'), $(q "$objection_text")) AS line
     FROM Submissions s
     JOIN Contracts c ON c.contractUID = s.contractUID
     JOIN Invoices i ON i.submissionUID = s.submissionUID AND i.invoiceStatus <> -1
     JOIN Accounts a ON a.accountUID = i.accountUID
     LEFT JOIN Facilities f ON f.facilityUID = i.facilityUID
     LEFT JOIN Allocations al ON al.invoiceUID = i.invoiceUID AND al.allocationStatus <> -1
     LEFT JOIN ServiceBillings b ON b.billingUID = al.billingUID AND b.billingStatus <> -1
     WHERE s.submissionStatus <> -1
     UNION ALL
     SELECT s.submittedDate, c.contractNumber, NULL,
       CONCAT_WS(';',
         $(de 's.submittedDate'), $(q 'c.contractNumber'), $(q "$(person a)"),
         '\"\"', '\"\"', '\"\"', '\"\"', '\"\"',
         $(q 'b.billingNumber'), $(de 'b.billingDate'), '\"\"', '\"\"', $(q "$objection_text"))
     FROM ServiceBillings b
     JOIN Submissions s ON s.submissionUID = b.submissionUID AND s.submissionStatus <> -1
     JOIN Contracts c ON c.contractUID = s.contractUID
     JOIN Accounts a ON a.accountUID = c.accountUID
     WHERE b.billingStatus <> -1
       AND NOT EXISTS (SELECT 1 FROM Allocations al
                        WHERE al.billingUID = b.billingUID AND al.allocationStatus <> -1)
   ) rows_to_export
   ORDER BY sortDate, sortContract, sortInvoice;"

echo "Fertig. Als Nächstes die neue Version starten (docker compose pull && docker compose up -d)." >&2
