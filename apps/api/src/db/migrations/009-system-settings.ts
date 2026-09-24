import type { MigrationContext } from '../umzug.js';

/**
 * System settings (see Notes/eunomia-plan.md, 2.6 / Slice 30): a key-value
 * table an admin edits through the UI, instead of pinning every operational
 * value to an `.env` file that only someone with shell access can change.
 *
 * Two things are deliberately NOT columns here:
 *  - No `isSecret` flag. Whether a stored value is encrypted is visible on the
 *    value itself (the `aes-256-gcm$…` envelope from lib/secret-box.ts), and
 *    which keys are secrets is declared in settings/registry.ts. A second
 *    source of that truth could drift from the first.
 *  - No type column. The registry declares the type and validates on write;
 *    the database only has to hand back the text it was given.
 *
 * `updatedByUserID` is ON DELETE SET NULL rather than CASCADE: who last touched
 * a setting is audit information that must outlive the user account.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE SystemSettings (
      settingKey VARCHAR(64) NOT NULL,
      settingValue TEXT DEFAULT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updatedByUserID BIGINT UNSIGNED DEFAULT NULL,
      PRIMARY KEY (settingKey),
      CONSTRAINT fk_systemsettings_user FOREIGN KEY (updatedByUserID)
        REFERENCES Users (userID) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** Drops the table; the defaults in the registry make every value reproducible. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS SystemSettings');
}
