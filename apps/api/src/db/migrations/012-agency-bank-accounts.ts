import type { MigrationContext } from '../umzug.js';

/**
 * A collection agency keeps its identity when it changes its bank account (see
 * Notes/eunomia-plan.md, Slice 38 / issues.md 5), and the account gains the two
 * fields the GiroCode was missing (issues.md 4): BIC and a beneficiary name
 * that may differ from the agency's own.
 *
 * AgencyBankAccounts is a "valid until the next entry" history like
 * ContractPremiums, with one difference: `validFrom` may be NULL, and NULL
 * means "applies from the beginning" (the author's decision, 2026-09-26). The
 * account recorded first therefore needs no invented start date — only a later
 * change carries one, and from that date on it wins. At most one undated entry
 * per agency; that is checked in the API, because MariaDB's UNIQUE allows NULL
 * more than once.
 *
 * CollectionAgencies.bankAccount goes away: the history is the single truth,
 * and a mirrored "current" column would drift from it.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE AgencyBankAccounts (
      agencyAccountID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      agencyAccountUID VARCHAR(12) NOT NULL UNIQUE,
      agencyUID VARCHAR(12) NOT NULL,
      validFrom DATE DEFAULT NULL,
      bankAccount VARCHAR(34) NOT NULL,
      bic VARCHAR(11) DEFAULT NULL,
      recipientName VARCHAR(70) DEFAULT NULL,
      note VARCHAR(255) DEFAULT NULL,
      agencyAccountStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (agencyAccountID),
      KEY idx_agency_accounts (agencyUID, validFrom),
      CONSTRAINT fk_agency_accounts_agency FOREIGN KEY (agencyUID)
        REFERENCES CollectionAgencies (agencyUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // The account known so far becomes the undated first entry of every agency,
  // deleted ones included: their rows come back with them (Slice 39).
  // CONCAT of the agency's own UID keeps the generated UID unique and within
  // the 12-character shape, without needing the application's ID generator.
  await pool.query(`
    INSERT INTO AgencyBankAccounts (agencyAccountUID, agencyUID, validFrom, bankAccount)
    SELECT CONCAT('g', SUBSTRING(agencyUID, 2)), agencyUID, NULL, bankAccount
      FROM CollectionAgencies
  `);

  // ALGORITHM=COPY, not the default INSTANT: an instant DROP COLUMN only marks
  // the column as gone and keeps its row space reserved for ever. On a database
  // that has been through enough ADD/DROP COLUMN, the reserved space alone
  // exceeds InnoDB's row limit and this very statement fails with "Row size too
  // large" — which leaves AgencyBankAccounts behind and blocks every later run,
  // because the migration is not recorded. Copying rebuilds the table and hands
  // that space back. The table holds a handful of rows; the lock costs nothing.
  await pool.query('ALTER TABLE CollectionAgencies DROP COLUMN bankAccount, ALGORITHM=COPY');
}

/**
 * Restores CollectionAgencies.bankAccount from the newest account of each
 * agency. LOSSY: BIC, beneficiary name, notes and every older account are
 * dropped, and an agency whose accounts were all deleted keeps an empty IBAN —
 * the old shape has no way to say "no account recorded".
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    "ALTER TABLE CollectionAgencies ADD COLUMN bankAccount VARCHAR(34) NOT NULL DEFAULT '' AFTER agencyName, ALGORITHM=COPY",
  );
  // MariaDB sorts NULL first, so DESC puts the dated entries ahead of the
  // undated one — which is exactly the account in force.
  await pool.query(`
    UPDATE CollectionAgencies c
       SET c.bankAccount = COALESCE((
         SELECT a.bankAccount FROM AgencyBankAccounts a
          WHERE a.agencyUID = c.agencyUID AND a.agencyAccountStatus <> -1
          ORDER BY a.validFrom DESC
          LIMIT 1
       ), '')
  `);
  await pool.query('ALTER TABLE CollectionAgencies ALTER COLUMN bankAccount DROP DEFAULT');

  await pool.query('DROP TABLE AgencyBankAccounts');
}
