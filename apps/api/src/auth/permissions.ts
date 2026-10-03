import type { Pool } from 'mariadb';

import type { Filter } from '../crud/repository.js';

/**
 * Permission keys the application code checks against. They mirror rows in the
 * `Permissions` catalog table, which is seeded by migrations — the migration
 * is the immutable source of truth for what exists in a given schema version;
 * this object is the compile-time-checked set the code refers to. Adding a
 * permission means both a new migration row and a new entry here.
 */
export const PERMISSIONS = {
  VIEW_INVOICES: 'VIEW_INVOICES',
  MANAGE_INVOICES: 'MANAGE_INVOICES',
  VIEW_ACCOUNTS: 'VIEW_ACCOUNTS',
  MANAGE_ACCOUNTS: 'MANAGE_ACCOUNTS',
  VIEW_CONTRACTS: 'VIEW_CONTRACTS',
  MANAGE_CONTRACTS: 'MANAGE_CONTRACTS',
  MANAGE_FACILITIES: 'MANAGE_FACILITIES',
  MANAGE_COMPANIES: 'MANAGE_COMPANIES',
  MANAGE_AGENCIES: 'MANAGE_AGENCIES',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  MANAGE_TRASH: 'MANAGE_TRASH',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Resolves whether a user holds a permission — the core of the rights model
 * (see Notes/eunomia-plan.md, 2.4).
 *
 * Invariants:
 *  - A GLOBAL grant (via `UserRoles`) authorizes the permission for EVERY
 *    account. So a user with the Admin role globally — which the setup step
 *    assigns and which carries every permission — passes any check regardless
 *    of `accountUID`; the "superadmin overrides scoping" rule falls out of this
 *    without a special case.
 *  - An ACCOUNT-SCOPED grant (via `UserAccountRoles`) authorizes the permission
 *    only for that one `accountUID`.
 *  - Grants from a deactivated role (`roleStatus <> 1`) never count.
 *
 * When `accountUID` is omitted, only the global grant can satisfy the check —
 * used for instance-wide permissions with no account context (e.g. MANAGE_USERS).
 */
export async function hasPermission(
  pool: Pool,
  userId: number,
  permission: PermissionKey,
  accountUID?: string,
): Promise<boolean> {
  const globalRows = await pool.query<Array<{ ok: number }>>(
    `SELECT 1 AS ok
       FROM UserRoles ur
       JOIN Roles r ON r.roleID = ur.roleID AND r.roleStatus = 1
       JOIN RolePermissions rp ON rp.roleID = ur.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID
      WHERE ur.userID = ? AND p.permissionKey = ?
      LIMIT 1`,
    [userId, permission],
  );
  if (globalRows.length > 0) return true;

  if (accountUID === undefined) return false;

  const scopedRows = await pool.query<Array<{ ok: number }>>(
    `SELECT 1 AS ok
       FROM UserAccountRoles uar
       JOIN Roles r ON r.roleID = uar.roleID AND r.roleStatus = 1
       JOIN RolePermissions rp ON rp.roleID = uar.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID
      WHERE uar.userID = ? AND uar.accountUID = ? AND p.permissionKey = ?
      LIMIT 1`,
    [userId, accountUID, permission],
  );
  return scopedRows.length > 0;
}

export interface AccountScope {
  /** True when a global grant makes every account accessible for the permission. */
  all: boolean;
  /** The specific accounts reachable through account-scoped grants (when not `all`). */
  accountUIDs: string[];
}

/**
 * Determines which accounts a user may exercise a permission on — used to
 * filter list endpoints. A global grant returns `all: true`; otherwise the
 * distinct set of accounts granted via `UserAccountRoles` for that permission.
 */
export async function getAccessibleAccounts(
  pool: Pool,
  userId: number,
  permission: PermissionKey,
): Promise<AccountScope> {
  if (await hasPermission(pool, userId, permission)) {
    return { all: true, accountUIDs: [] };
  }
  const rows = await pool.query<Array<{ accountUID: string }>>(
    `SELECT DISTINCT uar.accountUID
       FROM UserAccountRoles uar
       JOIN Roles r ON r.roleID = uar.roleID AND r.roleStatus = 1
       JOIN RolePermissions rp ON rp.roleID = uar.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID
      WHERE uar.userID = ? AND p.permissionKey = ?`,
    [userId, permission],
  );
  return { all: false, accountUIDs: rows.map((row) => row.accountUID) };
}

/**
 * The `WHERE` restriction that keeps a list inside the accounts the caller may
 * exercise `permission` on — invariant I-2, in one place instead of once per
 * list endpoint. `column` names the column holding the account UID in the
 * caller's query (`i.accountUID`, `c.accountUID`, …).
 *
 * `null` means the caller may see nothing at all: the route answers with an
 * empty list and asks the database nothing. A global grant yields the constant
 * `TRUE`, so the three kinds of grant collapse into two cases and every call
 * site reads the same three lines — there is no "did you handle `all`?" left to
 * get wrong.
 */
export async function accountFilter(
  pool: Pool,
  userId: number,
  permission: PermissionKey,
  column: string,
): Promise<Filter | null> {
  const scope = await getAccessibleAccounts(pool, userId, permission);
  if (scope.all) return { clause: 'TRUE', params: [] };
  if (scope.accountUIDs.length === 0) return null;
  return {
    clause: `${column} IN (${scope.accountUIDs.map(() => '?').join(', ')})`,
    params: scope.accountUIDs,
  };
}

/** A user who may exercise a permission, and on which accounts. */
export interface PermittedUser {
  userId: number;
  email: string;
  firstname: string;
  surname: string | null;
  /** True when a global grant covers every account — `accountUIDs` is then empty. */
  all: boolean;
  accountUIDs: string[];
}

/**
 * The inverse of `getAccessibleAccounts`: not "which accounts may this user
 * see" but "who may see this account". The payment reminders need it, because
 * a scheduled run has no logged-in user to start from — it has invoices and
 * has to find everyone allowed to hear about them.
 *
 * Deactivated users (`userStatus <> 1`) are left out: someone who cannot log in
 * should not keep receiving mail about the household's invoices. Grants from a
 * deactivated role never count, as everywhere else in this model.
 *
 * Lives next to its inverse on purpose — the two queries share every join, and
 * a change to the rights model has to reach both.
 */
export async function listUsersWithAccess(
  pool: Pool,
  permission: PermissionKey,
): Promise<PermittedUser[]> {
  const rows = await pool.query<
    Array<{
      userID: number;
      email: string;
      firstname: string;
      surname: string | null;
      accountUID: string | null;
    }>
  >(
    `SELECT u.userID, u.email, u.firstname, u.surname, grants.accountUID
       FROM Users u
       JOIN (
              SELECT ur.userID, NULL AS accountUID
                FROM UserRoles ur
                JOIN Roles r ON r.roleID = ur.roleID AND r.roleStatus = 1
                JOIN RolePermissions rp ON rp.roleID = ur.roleID
                JOIN Permissions p ON p.permissionID = rp.permissionID
               WHERE p.permissionKey = ?
               UNION ALL
              SELECT uar.userID, uar.accountUID
                FROM UserAccountRoles uar
                JOIN Roles r ON r.roleID = uar.roleID AND r.roleStatus = 1
                JOIN RolePermissions rp ON rp.roleID = uar.roleID
                JOIN Permissions p ON p.permissionID = rp.permissionID
               WHERE p.permissionKey = ?
            ) grants ON grants.userID = u.userID
      WHERE u.userStatus = 1
      ORDER BY u.userID`,
    [permission, permission],
  );

  const users = new Map<number, PermittedUser>();
  for (const row of rows) {
    const user = users.get(row.userID) ?? {
      userId: row.userID,
      email: row.email,
      firstname: row.firstname,
      surname: row.surname,
      all: false,
      accountUIDs: [],
    };
    if (row.accountUID === null) {
      // A global grant subsumes every scoped one, so the list stops mattering.
      user.all = true;
      user.accountUIDs = [];
    } else if (!user.all && !user.accountUIDs.includes(row.accountUID)) {
      user.accountUIDs.push(row.accountUID);
    }
    users.set(row.userID, user);
  }
  return [...users.values()];
}

export interface EffectivePermissions {
  /** Permission keys granted globally (apply to every account). */
  global: string[];
  /** Account-scoped grants, one entry per (account, permission) pair. */
  perAccount: Array<{ accountUID: string; permissionKey: string }>;
}

/** Collects a user's effective permissions for display (e.g. the /me endpoint). */
export async function getEffectivePermissions(
  pool: Pool,
  userId: number,
): Promise<EffectivePermissions> {
  const globalRows = await pool.query<Array<{ permissionKey: string }>>(
    `SELECT DISTINCT p.permissionKey
       FROM UserRoles ur
       JOIN Roles r ON r.roleID = ur.roleID AND r.roleStatus = 1
       JOIN RolePermissions rp ON rp.roleID = ur.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID
      WHERE ur.userID = ?`,
    [userId],
  );

  const scopedRows = await pool.query<Array<{ accountUID: string; permissionKey: string }>>(
    `SELECT DISTINCT uar.accountUID, p.permissionKey
       FROM UserAccountRoles uar
       JOIN Roles r ON r.roleID = uar.roleID AND r.roleStatus = 1
       JOIN RolePermissions rp ON rp.roleID = uar.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID
      WHERE uar.userID = ?`,
    [userId],
  );

  return {
    global: globalRows.map((row) => row.permissionKey),
    perAccount: scopedRows.map((row) => ({
      accountUID: row.accountUID,
      permissionKey: row.permissionKey,
    })),
  };
}
