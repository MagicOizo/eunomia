import type { MigrationContext } from '../umzug.js';

/**
 * Adds objection ("Widerspruch") tracking to service billings. When a
 * Leistungsabrechnung comes back wrong, the user files an objection to keep
 * track of whether the insurance still owes something:
 * - objectionDate: when the objection was filed (null = none)
 * - objectionResolvedDate: when it was settled (null while still open)
 * - objectionNote: optional reason/remark
 * An objection is "open" while objectionDate is set and objectionResolvedDate
 * is not. Since a billing can cover several invoices, an open objection on it
 * flags every invoice reimbursed through it (see Invoices.hasOpenObjection).
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE ServiceBillings
      ADD COLUMN objectionDate DATE DEFAULT NULL AFTER documentLink,
      ADD COLUMN objectionResolvedDate DATE DEFAULT NULL AFTER objectionDate,
      ADD COLUMN objectionNote VARCHAR(500) DEFAULT NULL AFTER objectionResolvedDate
  `);
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE ServiceBillings
      DROP COLUMN objectionNote,
      DROP COLUMN objectionResolvedDate,
      DROP COLUMN objectionDate
  `);
}
