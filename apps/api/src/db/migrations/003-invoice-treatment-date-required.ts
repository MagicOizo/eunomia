import type { MigrationContext } from '../umzug.js';

/**
 * Makes `Invoices.treatmentDate` mandatory. The deductible/bonus logic is keyed
 * by the year of TREATMENT, not of billing (see Notes/eunomia-plan.md, Slice 8):
 * the first attempt used the billing date and that proved wrong for the yearly
 * thresholds. Existing rows that predate this requirement are backfilled with
 * their invoice date before the column is tightened.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('UPDATE Invoices SET treatmentDate = invoiceDate WHERE treatmentDate IS NULL');
  await pool.query('ALTER TABLE Invoices MODIFY treatmentDate DATE NOT NULL');
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Invoices MODIFY treatmentDate DATE DEFAULT NULL');
}
