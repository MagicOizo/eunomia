import type { MigrationContext } from '../umzug.js';

/**
 * The Papierkorb (see Notes/eunomia-plan.md, Slice 39): everything the app
 * deletes is soft-deleted (`...Status = -1`), so far without a way to see it,
 * bring it back or remove it for good.
 *
 * Two things are needed for that:
 *  - `deletedAt` on every soft-deletable domain table. Without a timestamp the
 *    trash can neither be sorted by when something went nor, later, carry a
 *    retention period. It doubles as the marker of one deletion *batch*: a
 *    cascade (a billing and its allocations) writes the same moment into every
 *    row, and restoring reverses exactly that batch. Hence DATETIME(6): the
 *    value is an identity, not a display value, and two deletions a
 *    millisecond apart must not collapse into one batch.
 *  - the `MANAGE_TRASH` permission. Restoring and purging cut across every
 *    entity and are not account-scoped, so the trash is an administrative
 *    view: the Admin role gets the right, the `Nutzer` role does not.
 *
 * Users and Roles deliberately have NO `deletedAt`: the trash does not cover
 * the user administration, which has its own mask with "deactivated/removed".
 *
 * Rows deleted before this migration keep `deletedAt = NULL` and show up as
 * "unbekannt" — inventing a moment nobody recorded would be worse (the same
 * stance as the undated bank account in Slice 38).
 */

/** Every table whose rows can reach the trash. */
const TABLES = [
  'Accounts',
  'InsuranceCompanies',
  'Contracts',
  'ContractPremiums',
  'ContractTerms',
  'Facilities',
  'CollectionAgencies',
  'AgencyBankAccounts',
  'Submissions',
  'Invoices',
  'ServiceBillings',
  'Allocations',
] as const;

export async function up({ context: pool }: MigrationContext): Promise<void> {
  for (const table of TABLES) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN deletedAt DATETIME(6) DEFAULT NULL`);
  }

  await pool.query('INSERT INTO Permissions (permissionKey, description) VALUES (?, ?)', [
    'MANAGE_TRASH',
    'See the trash, restore deleted records and delete them for good',
  ]);
  // Migration 002 gave the Admin role every permission that existed back then
  // with one cross join; a permission added later needs its own grant.
  await pool.query(`
    INSERT INTO RolePermissions (roleID, permissionID)
    SELECT r.roleID, p.permissionID FROM Roles r, Permissions p
     WHERE r.roleName = 'Admin' AND p.permissionKey = 'MANAGE_TRASH'
  `);
}

/**
 * Takes the columns and the permission back out. `ALGORITHM=COPY` on every
 * DROP: MariaDB's default "instant" drop leaves the removed column's row space
 * reserved for ever, and twelve columns added and dropped again is exactly the
 * ballast that broke InnoDB's row limit in Slice 38. `RolePermissions` hangs
 * off `Permissions` with ON DELETE CASCADE, so the grant goes with the row.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query("DELETE FROM Permissions WHERE permissionKey = 'MANAGE_TRASH'");
  for (const table of TABLES) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN deletedAt, ALGORITHM=COPY`);
  }
}
