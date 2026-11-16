import type { MigrationContext } from '../umzug.js';

/**
 * `reminders.appUrl` becomes `general.appUrl` (Slice 85, see Notes/eunomia-plan.md
 * "Paket Anmeldung über OIDC"): the instance address now serves the redirect URI
 * of the sign-in provider as well as the link in the reminder mail, so it no
 * longer belongs to the reminders.
 *
 * Without this rename a stored address would vanish silently — the settings
 * repository skips rows whose key the registry no longer knows.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    "UPDATE SystemSettings SET settingKey = 'general.appUrl' WHERE settingKey = 'reminders.appUrl'",
  );
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    "UPDATE SystemSettings SET settingKey = 'reminders.appUrl' WHERE settingKey = 'general.appUrl'",
  );
}
