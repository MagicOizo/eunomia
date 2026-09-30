import type { Pool } from 'mariadb';

import { withTransaction } from '../db/transaction.js';

/**
 * Data access for the admin user/role management API (Slice 9). Public UUIDs
 * are used at the boundary; the numeric userID stays internal (resolved via
 * userIdByUuid) for the join tables.
 */

export interface AdminUser {
  uuid: string;
  email: string;
  firstname: string;
  surname: string | null;
  status: number;
  globalRoles: string[];
  accountGrants: Array<{ accountUID: string; roleName: string }>;
}

export interface AdminRole {
  roleUID: string;
  roleName: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

const ADMIN_ROLE = 'Admin';

/** Resolves a public user UUID to the internal numeric id, or null. */
export async function userIdByUuid(pool: Pool, uuid: string): Promise<number | null> {
  const rows = await pool.query<Array<{ userID: number }>>(
    'SELECT userID FROM Users WHERE uuidText = ? AND userStatus <> -1 LIMIT 1',
    [uuid],
  );
  return rows[0]?.userID ?? null;
}

/** Lists all non-deleted users with their global roles and account grants. */
export async function listUsers(pool: Pool): Promise<AdminUser[]> {
  const users = await pool.query<
    Array<{
      userID: number;
      uuid: string;
      email: string;
      firstname: string;
      surname: string | null;
      status: number;
    }>
  >(
    `SELECT userID, uuidText AS uuid, email, firstname, surname, userStatus AS status
       FROM Users WHERE userStatus <> -1 ORDER BY email`,
  );
  const globalRoles = await pool.query<Array<{ userID: number; roleName: string }>>(
    `SELECT ur.userID, r.roleName FROM UserRoles ur JOIN Roles r ON r.roleID = ur.roleID`,
  );
  const grants = await pool.query<Array<{ userID: number; accountUID: string; roleName: string }>>(
    `SELECT uar.userID, uar.accountUID, r.roleName
       FROM UserAccountRoles uar JOIN Roles r ON r.roleID = uar.roleID`,
  );

  return users.map((u) => ({
    uuid: u.uuid,
    email: u.email,
    firstname: u.firstname,
    surname: u.surname,
    status: u.status,
    globalRoles: globalRoles.filter((g) => g.userID === u.userID).map((g) => g.roleName),
    accountGrants: grants
      .filter((g) => g.userID === u.userID)
      .map((g) => ({ accountUID: g.accountUID, roleName: g.roleName })),
  }));
}

/** Fetches a single non-deleted user by UUID with roles/grants, or null. */
export async function getUser(pool: Pool, uuid: string): Promise<AdminUser | null> {
  const users = await listUsers(pool);
  return users.find((u) => u.uuid === uuid) ?? null;
}

/** Updates the given user fields (only the provided ones). Returns rows affected. */
export async function updateUser(
  pool: Pool,
  uuid: string,
  fields: {
    email?: string;
    firstname?: string;
    surname?: string | null;
    status?: number;
    passwordHash?: string;
  },
): Promise<number> {
  const columns: string[] = [];
  const values: unknown[] = [];
  const map: Record<string, unknown> = {
    email: fields.email,
    firstname: fields.firstname,
    surname: fields.surname,
    userStatus: fields.status,
    passwordHash: fields.passwordHash,
  };
  for (const [column, value] of Object.entries(map)) {
    if (value !== undefined) {
      columns.push(`${column} = ?`);
      values.push(value);
    }
  }
  if (columns.length === 0) return 0;
  const result = (await pool.query(
    `UPDATE Users SET ${columns.join(', ')} WHERE uuidText = ? AND userStatus <> -1`,
    [...values, uuid],
  )) as { affectedRows: number };
  return result.affectedRows;
}

/** Soft-deletes a user (userStatus = -1). Returns rows affected. */
export async function softDeleteUser(pool: Pool, uuid: string): Promise<number> {
  const result = (await pool.query(
    `UPDATE Users SET userStatus = -1 WHERE uuidText = ? AND userStatus <> -1`,
    [uuid],
  )) as { affectedRows: number };
  return result.affectedRows;
}

/** Replaces a user's global roles (UserRoles) with the given role UIDs. */
export async function setGlobalRoles(
  pool: Pool,
  userId: number,
  roleUIDs: string[],
): Promise<void> {
  await withTransaction(pool, async (conn) => {
    await conn.query('DELETE FROM UserRoles WHERE userID = ?', [userId]);
    for (const roleUID of roleUIDs) {
      await conn.query(
        `INSERT INTO UserRoles (userID, roleID) SELECT ?, roleID FROM Roles WHERE roleUID = ?`,
        [userId, roleUID],
      );
    }
  });
}

/** Replaces a user's account-scoped grants (UserAccountRoles). */
export async function setAccountRoles(
  pool: Pool,
  userId: number,
  grants: Array<{ accountUID: string; roleUID: string }>,
): Promise<void> {
  await withTransaction(pool, async (conn) => {
    await conn.query('DELETE FROM UserAccountRoles WHERE userID = ?', [userId]);
    for (const grant of grants) {
      await conn.query(
        `INSERT INTO UserAccountRoles (userID, roleID, accountUID)
         SELECT ?, roleID, ? FROM Roles WHERE roleUID = ?`,
        [userId, grant.accountUID, grant.roleUID],
      );
    }
  });
}

/** Lists all roles with their permission keys (read-only for the UI). */
export async function listRoles(pool: Pool): Promise<AdminRole[]> {
  const roles = await pool.query<
    Array<{ roleUID: string; roleName: string; description: string | null; isSystem: number }>
  >(
    'SELECT roleUID, roleName, description, isSystem FROM Roles WHERE roleStatus = 1 ORDER BY roleName',
  );
  const perms = await pool.query<Array<{ roleUID: string; permissionKey: string }>>(
    `SELECT r.roleUID, p.permissionKey
       FROM RolePermissions rp
       JOIN Roles r ON r.roleID = rp.roleID
       JOIN Permissions p ON p.permissionID = rp.permissionID`,
  );
  return roles.map((r) => ({
    roleUID: r.roleUID,
    roleName: r.roleName,
    description: r.description,
    isSystem: r.isSystem === 1,
    permissions: perms.filter((p) => p.roleUID === r.roleUID).map((p) => p.permissionKey),
  }));
}

/** Whether a user currently holds the Admin role globally and is active. */
export async function isActiveAdmin(pool: Pool, uuid: string): Promise<boolean> {
  const rows = await pool.query<Array<{ ok: number }>>(
    `SELECT 1 AS ok
       FROM Users u
       JOIN UserRoles ur ON ur.userID = u.userID
       JOIN Roles r ON r.roleID = ur.roleID AND r.roleName = ?
      WHERE u.uuidText = ? AND u.userStatus = 1 LIMIT 1`,
    [ADMIN_ROLE, uuid],
  );
  return rows.length > 0;
}

/** Counts active users holding the Admin role globally (for last-admin protection). */
export async function countActiveAdmins(pool: Pool): Promise<number> {
  const rows = await pool.query<Array<{ total: number }>>(
    `SELECT COUNT(DISTINCT u.userID) AS total
       FROM Users u
       JOIN UserRoles ur ON ur.userID = u.userID
       JOIN Roles r ON r.roleID = ur.roleID AND r.roleName = ?
      WHERE u.userStatus = 1`,
    [ADMIN_ROLE],
  );
  return rows[0]?.total ?? 0;
}
