import type { MigrationContext } from '../umzug.js';

/**
 * A collection agency holds SEVERAL bank accounts at the same time, and the
 * invoice says which of them it goes to (see Notes/eunomia-plan.md, Slice 44 /
 * issues.md 0.12.0-4).
 *
 * Slice 38 read the accounts as a history: `validFrom`, at most one entry per
 * start, exactly one account in force at any moment, resolved against the
 * invoice's `transferDate`. Production says otherwise — one agency named three
 * accounts on one bill and, months later, only the second of them on a bill of
 * another facility. Nothing was replaced; the agency simply has several
 * accounts, and every bill picks one. The "one at a time" assumption therefore
 * goes, and with it `validFrom`.
 *
 * What replaces it is an explicit pointer: `Invoices.agencyAccountUID`. The
 * backfill below freezes what the old rule showed, so no invoice changes its
 * IBAN over this migration; from here on nothing has to be guessed.
 *
 * Dates entered by hand are not thrown away silently: a `validFrom` moves into
 * the account's note before the column goes.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE Invoices
      ADD COLUMN agencyAccountUID VARCHAR(12) DEFAULT NULL AFTER agencyUID,
      ADD CONSTRAINT fk_invoices_agency_account FOREIGN KEY (agencyAccountUID)
        REFERENCES AgencyBankAccounts (agencyAccountUID) ON DELETE RESTRICT ON UPDATE CASCADE
  `);

  // The account the old rule resolves to, deleted invoices included: they can
  // come back from the trash. MariaDB sorts NULL first, so DESC puts the dated
  // entries ahead of the undated one — the very ranking of `accountInForce`.
  await pool.query(`
    UPDATE Invoices i SET i.agencyAccountUID = (
      SELECT a.agencyAccountUID FROM AgencyBankAccounts a
       WHERE a.agencyUID = i.agencyUID AND a.agencyAccountStatus <> -1
         AND (a.validFrom IS NULL OR a.validFrom <= COALESCE(i.transferDate, CURDATE()))
       ORDER BY a.validFrom DESC LIMIT 1)
     WHERE i.agencyUID IS NOT NULL
  `);

  // LEFT(…, 255) because the note's column is that wide and a long note plus
  // the appended date would otherwise be truncated by the database itself.
  await pool.query(`
    UPDATE AgencyBankAccounts
       SET note = LEFT(
             CONCAT_WS(' · ', note, CONCAT('gültig ab ', DATE_FORMAT(validFrom, '%d.%m.%Y'))),
             255)
     WHERE validFrom IS NOT NULL
  `);

  // `idx_agency_accounts` needs no statement of its own: dropping a column
  // removes it from every index it is part of, so the key stays as (agencyUID)
  // — which is what the lookups by agency want anyway.
  //
  // ALGORITHM=COPY, not the default INSTANT: an instant DROP COLUMN only marks
  // the column as gone and keeps its row space reserved for ever, so a database
  // that has been through enough ADD/DROP COLUMN eventually fails with "Row
  // size too large" on a later migration — the lesson from 012.
  await pool.query('ALTER TABLE AgencyBankAccounts DROP COLUMN validFrom, ALGORITHM=COPY');
}

/**
 * Restores `validFrom` (empty everywhere) and drops the invoice's pointer.
 *
 * LOSSY twice over: which account an invoice goes to is gone, and so is every
 * start date — the old shape cannot hold either. An agency with several
 * accounts ends up with several undated entries, which the old "at most one
 * undated per agency" rule forbids; nothing enforces it in the database, so the
 * rows survive and only the next write through the API complains.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE AgencyBankAccounts
      ADD COLUMN validFrom DATE DEFAULT NULL AFTER agencyUID,
      DROP INDEX idx_agency_accounts,
      ADD KEY idx_agency_accounts (agencyUID, validFrom),
      ALGORITHM=COPY
  `);
  await pool.query(`
    ALTER TABLE Invoices
      DROP FOREIGN KEY fk_invoices_agency_account,
      DROP COLUMN agencyAccountUID,
      ALGORITHM=COPY
  `);
}
