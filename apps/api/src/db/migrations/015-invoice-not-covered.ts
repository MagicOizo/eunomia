import type { MigrationContext } from '../umzug.js';

/**
 * An invoice can be known to be outside the insurance's cover (see
 * Notes/eunomia-plan.md, Slice 42 / issues.md 0.12.0-2). It is then never
 * submitted anywhere, and it must not count towards the deductible either.
 *
 * Decided by the author (2026-09-28): a flag of the INVOICE, not a collection
 * of the per-policy marks in `InvoiceExclusions`. A policy taken out later
 * would not be covered by such a collection, and there the invoice would count
 * towards the deductible again — "will never be submitted" is a property of
 * the invoice, not of a pair of invoice and policy.
 *
 * `notCoveredReason` is what the mark is for: it says months later why the
 * invoice was put aside. The API therefore demands it whenever the flag is
 * set, and clears it when the flag goes away; both are rules, not columns, so
 * the reason may be NULL here.
 *
 * No data migration: the default is the truth for every invoice recorded so
 * far — none of them was marked, because there was nothing to mark with.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE Invoices
      ADD COLUMN notCovered TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN notCoveredReason VARCHAR(255) DEFAULT NULL
  `);
}

/**
 * Drops both columns. Lossless for the old shape, which has no place for
 * either of them.
 *
 * ALGORITHM=COPY, not the default INSTANT: an instant DROP COLUMN only marks
 * the column as gone and keeps its row space reserved for ever, so a database
 * that has been through enough ADD/DROP COLUMN eventually fails with "Row size
 * too large" on a later migration. Copying rebuilds the table and hands that
 * space back — the lesson from 012.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    'ALTER TABLE Invoices DROP COLUMN notCovered, DROP COLUMN notCoveredReason, ALGORITHM=COPY',
  );
}
