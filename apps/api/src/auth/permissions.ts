import type { Pool } from 'mariadb';

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
