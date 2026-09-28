import type { MigrationContext } from '../umzug.js';

/**
 * An invoice bills several treatment days (see Notes/eunomia-plan.md, Slice 41
 * / issues.md 0.11.0-1). Decided by the author (2026-09-28): the days only, no
 * amount per treatment — and an invoice stays within ONE calendar year, as
 * before. Anything spanning a turn of the year is split into two invoices,
 * which nothing stops: `invoiceNumber` carries neither a UNIQUE nor a
 * duplicate check.
 *
 * InvoiceTreatmentDays is an attached list, not an entity: no UID, no status
 * column, primary key (invoiceUID, treatmentDate) — which is at once the
 * "the same day twice is a typo, not a date" constraint. Same shape as
 * SubmissionInvoices, InvoiceExclusions, ContractBonusTiers.
 *
 * Every invoice gets a row here, deleted ones included (like 012): the child
 * table is the COMPLETE list from the start, not "the further days" — else
 * every reader would need a special case for the first day. Invoices.
 * treatmentDate stays and stays NOT NULL: it is the leading day and the anchor
 * of every YEAR() evaluation (contract years, bonus timeline, optimizer,
 * reimbursement plan). The API keeps it on the earliest day at every write, so
 * "first" and "earliest" cannot drift apart; mirroring it is harmless here,
 * unlike the agency's bank account in 012, because the one-year rule makes
 * every day answer the same YEAR().
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE InvoiceTreatmentDays (
      invoiceUID VARCHAR(12) NOT NULL,
      treatmentDate DATE NOT NULL,
      PRIMARY KEY (invoiceUID, treatmentDate),
      CONSTRAINT fk_treatmentdays_invoice FOREIGN KEY (invoiceUID)
        REFERENCES Invoices (invoiceUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    INSERT INTO InvoiceTreatmentDays (invoiceUID, treatmentDate)
    SELECT invoiceUID, treatmentDate FROM Invoices
  `);
}

/**
 * Drops the table. Lossless for the old shape: Invoices.treatmentDate carries
 * the leading day and never left. Only the further days are gone, and the old
 * shape has no place to keep them.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DROP TABLE InvoiceTreatmentDays');
}
