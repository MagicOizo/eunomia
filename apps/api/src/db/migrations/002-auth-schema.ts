import { generateEntityId } from '../../lib/ids.js';
import type { MigrationContext } from '../umzug.js';

/**
 * Auth and rights schema (see Notes/eunomia-plan.md, 2.4 and Slice 3).
 *
 * Two deliberate departures from the domain conventions of migration 001:
 *  - Users are identified publicly by a UUID (BINARY(16) + a VIRTUAL
 *    `uuidText` view of it), never by the enumerable auto-increment key —
 *    carried over from the first attempt. Every other entity keeps the
 *    prefixed-NanoID scheme; only users switched to UUID by the author's
 *    decision.
 *  - The auth junction/token tables use ON DELETE CASCADE (not RESTRICT): a
 *    role assignment or refresh token is meaningless once its owning user,
 *    role, or account is gone, so the database may clean them up. The domain
 *    tables from 001 keep RESTRICT.
 *
 * The permission catalog and the two system roles (Admin, Nutzer) are seeded
 * here rather than in the dev seed, so they exist in every environment
 * (including production) as part of the schema itself.
 */

/** Permission catalog: (key, human description). Extended by adding rows, never bits. */
const PERMISSIONS: ReadonlyArray<readonly [key: string, description: string]> = [
  ['VIEW_INVOICES', 'View invoices and service billings'],
  ['MANAGE_INVOICES', 'Create, edit, submit and reconcile invoices'],
  ['VIEW_ACCOUNTS', 'View accounts (insured persons)'],
  ['MANAGE_ACCOUNTS', 'Create and edit accounts'],
  ['VIEW_CONTRACTS', 'View insurance contracts'],
  ['MANAGE_CONTRACTS', 'Create and edit insurance contracts'],
  ['MANAGE_FACILITIES', 'Manage facilities (doctors, hospitals, pharmacies)'],
  ['MANAGE_COMPANIES', 'Manage insurance companies'],
  ['MANAGE_AGENCIES', 'Manage collection agencies'],
  ['MANAGE_USERS', 'Manage users, roles and permission assignments'],
  ['MANAGE_SETTINGS', 'Read and change system settings'],
];

/** Permission keys granted to the non-admin default role. Admin gets everything. */
const NUTZER_PERMISSIONS = [
  'VIEW_INVOICES',
  'MANAGE_INVOICES',
  'VIEW_ACCOUNTS',
  'VIEW_CONTRACTS',
];

/** Expands a UUID's HEX form into the canonical dashed, lowercased text form. */
const UUID_TEXT_EXPR =
  "LOWER(INSERT(INSERT(INSERT(INSERT(HEX(%COL%),9,0,'-'),14,0,'-'),19,0,'-'),24,0,'-'))";

export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE Users (
      userID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      uuid BINARY(16) NOT NULL UNIQUE DEFAULT (UNHEX(REPLACE(UUID(), '-', ''))),
      uuidText VARCHAR(36) GENERATED ALWAYS AS (${UUID_TEXT_EXPR.replace('%COL%', 'uuid')}) VIRTUAL,
      email VARCHAR(255) NOT NULL UNIQUE,
      surname VARCHAR(50),
      firstname VARCHAR(50) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      userStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (userID),
      KEY idx_users_uuidText (uuidText)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE Roles (
      roleID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      roleUID VARCHAR(12) NOT NULL UNIQUE,
      roleName VARCHAR(50) NOT NULL UNIQUE,
      description VARCHAR(255) DEFAULT NULL,
      isSystem TINYINT(1) NOT NULL DEFAULT 0,
      roleStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (roleID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE Permissions (
      permissionID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      permissionKey VARCHAR(64) NOT NULL UNIQUE,
      description VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (permissionID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE RolePermissions (
      roleID BIGINT UNSIGNED NOT NULL,
      permissionID BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (roleID, permissionID),
      CONSTRAINT fk_rp_role FOREIGN KEY (roleID)
        REFERENCES Roles (roleID) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rp_permission FOREIGN KEY (permissionID)
        REFERENCES Permissions (permissionID) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Global role grants — apply across every account.
  await pool.query(`
    CREATE TABLE UserRoles (
      userID BIGINT UNSIGNED NOT NULL,
      roleID BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (userID, roleID),
      CONSTRAINT fk_ur_user FOREIGN KEY (userID)
        REFERENCES Users (userID) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_ur_role FOREIGN KEY (roleID)
        REFERENCES Roles (roleID) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Account-scoped role grants — the same role, but limited to one account.
  await pool.query(`
    CREATE TABLE UserAccountRoles (
      userID BIGINT UNSIGNED NOT NULL,
      roleID BIGINT UNSIGNED NOT NULL,
      accountUID VARCHAR(12) NOT NULL,
      PRIMARY KEY (userID, roleID, accountUID),
      KEY idx_uar_account (accountUID),
      CONSTRAINT fk_uar_user FOREIGN KEY (userID)
        REFERENCES Users (userID) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_uar_role FOREIGN KEY (roleID)
        REFERENCES Roles (roleID) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_uar_account FOREIGN KEY (accountUID)
        REFERENCES Accounts (accountUID) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Refresh tokens are stored only as a SHA-256 hash of the opaque token, so a
  // database dump does not reveal usable tokens. sessionUUIDText lets a session
  // be identified/revoked without exposing the token itself.
  await pool.query(`
    CREATE TABLE RefreshTokens (
      tokenID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      userID BIGINT UNSIGNED NOT NULL,
      tokenHash CHAR(64) NOT NULL UNIQUE,
      sessionUUID BINARY(16) NOT NULL DEFAULT (UNHEX(REPLACE(UUID(), '-', ''))),
      sessionUUIDText VARCHAR(36) GENERATED ALWAYS AS (${UUID_TEXT_EXPR.replace(
        '%COL%',
        'sessionUUID',
      )}) VIRTUAL,
      issuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      revokedAt DATETIME DEFAULT NULL,
      PRIMARY KEY (tokenID),
      KEY idx_refresh_user (userID),
      CONSTRAINT fk_refresh_user FOREIGN KEY (userID)
        REFERENCES Users (userID) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await seedPermissionsAndRoles(pool);
}

/** Inserts the permission catalog and the two system roles with their grants. */
async function seedPermissionsAndRoles(pool: MigrationContext['context']): Promise<void> {
  for (const [key, description] of PERMISSIONS) {
    await pool.query('INSERT INTO Permissions (permissionKey, description) VALUES (?, ?)', [
      key,
      description,
    ]);
  }

  await pool.query(
    'INSERT INTO Roles (roleUID, roleName, description, isSystem) VALUES (?, ?, ?, 1)',
    [generateEntityId('role'), 'Admin', 'Full access to everything (superadmin)'],
  );
  await pool.query(
    'INSERT INTO Roles (roleUID, roleName, description, isSystem) VALUES (?, ?, ?, 1)',
    [generateEntityId('role'), 'Nutzer', 'Standard user: work with invoices for assigned accounts'],
  );

  // Admin gets every permission; the resolver additionally treats a global
  // Admin grant as account-unrestricted (see auth/permissions.ts).
  await pool.query(`
    INSERT INTO RolePermissions (roleID, permissionID)
    SELECT r.roleID, p.permissionID FROM Roles r, Permissions p WHERE r.roleName = 'Admin'
  `);

  const placeholders = NUTZER_PERMISSIONS.map(() => '?').join(', ');
  await pool.query(
    `INSERT INTO RolePermissions (roleID, permissionID)
     SELECT r.roleID, p.permissionID FROM Roles r JOIN Permissions p
     WHERE r.roleName = 'Nutzer' AND p.permissionKey IN (${placeholders})`,
    NUTZER_PERMISSIONS,
  );
}

/** Drops every auth table in reverse dependency order. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  for (const table of [
    'RefreshTokens',
    'UserAccountRoles',
    'UserRoles',
    'RolePermissions',
    'Permissions',
    'Roles',
    'Users',
  ]) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
