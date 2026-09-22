import type { MigrationContext } from '../umzug.js';

/**
 * Drops `Submissions.documentLink`. A submission (Einreichung) only bundles
 * invoices and binds them to one contract — the scanned documents belong to the
 * individual invoices (`Invoices.documentLink`) and service billings
 * (`ServiceBillings.documentLink`), not to the submission itself. The column was
 * never surfaced in the UI and modelled the domain wrongly.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Submissions DROP COLUMN documentLink');
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    'ALTER TABLE Submissions ADD COLUMN documentLink VARCHAR(255) DEFAULT NULL AFTER submittedDate',
  );
}
