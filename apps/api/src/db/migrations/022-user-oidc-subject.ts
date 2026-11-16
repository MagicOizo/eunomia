import type { MigrationContext } from '../umzug.js';

/**
 * The identity a user has at the sign-in provider (Slice 88, see
 * Notes/eunomia-plan.md "Paket Anmeldung über OIDC"): the ID token's `sub`.
 *
 * The e-mail address links an account once; after that `sub` leads, because the
 * address is an attribute that can change on either side while `sub` is the
 * identity. NULL means "not linked yet" — every account until its first sign-in
 * through the provider.
 *
 * UNIQUE, so two accounts can never carry the same foreign identity. MariaDB
 * allows any number of NULLs under a unique key. VARCHAR(255): OpenID Connect
 * caps `sub` at 255 ASCII characters.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE Users
      ADD COLUMN oidcSubject VARCHAR(255) DEFAULT NULL,
      ADD UNIQUE KEY uq_users_oidcSubject (oidcSubject)
  `);
}

export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE Users DROP KEY uq_users_oidcSubject, DROP COLUMN oidcSubject');
}
