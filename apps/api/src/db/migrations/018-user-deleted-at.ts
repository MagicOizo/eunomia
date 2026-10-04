import type { MigrationContext } from '../umzug.js';

/**
 * When a user was deleted (SEC-15, Scheibe 18).
 *
 * Migration 013 gave every soft-deletable domain table a `deletedAt` and said
 * of this one: "Users and Roles deliberately have NO deletedAt: the trash does
 * not cover the user administration, which has its own mask." The first half
 * of that still holds — users stay out of the Papierkorb, see the reasons in
 * Notes/eunomia-plan.md §2.11 — but the mask was missing the other half: a
 * deleted user could neither be seen nor brought back nor removed for good, so
 * name and e-mail address stayed in the table for ever.
 *
 * The column is what makes both possible: the mask can say when it happened,
 * and the retention period knows how old the deletion is. DATETIME(6) like in
 * 013, for one shape of timestamp across the schema — the batch meaning the
 * domain tables give it has no counterpart here, a user is deleted alone.
 *
 * Rows already deleted keep `deletedAt = NULL` and therefore never age out, as
 * in the trash: a retention period must not delete on the strength of a moment
 * nobody recorded. They are removable by hand in the mask.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Users ADD COLUMN deletedAt DATETIME(6) DEFAULT NULL');
}

/** Drops the column; the deleted users themselves stay as they are. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Users DROP COLUMN deletedAt');
}
