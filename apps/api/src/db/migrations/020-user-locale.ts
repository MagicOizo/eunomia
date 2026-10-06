import type { MigrationContext } from '../umzug.js';

/**
 * A user's language and number/date format (Slice 82, see Notes/eunomia-plan.md
 * "Paket Lokalisierung"). Both are optional: NULL means "follow" — the browser
 * language in the web, then the instance's `general.defaultLocale` /
 * `general.defaultFormat`, then German. The language also decides the language
 * of the mails a user receives, where there is no browser to ask.
 *
 * Plain VARCHAR rather than ENUM: the lists live in @eunomia/shared
 * (SUPPORTED_LOCALES, FORMAT_REGIONS) and the API validates against them, so a
 * new language needs no migration.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE Users
      ADD COLUMN locale VARCHAR(5) DEFAULT NULL,
      ADD COLUMN formatRegion VARCHAR(5) DEFAULT NULL
  `);
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Users DROP COLUMN locale, DROP COLUMN formatRegion');
}
