import type { Pool } from 'mariadb';

import { type Queryable, execute, placeholders } from '../crud/repository.js';
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
  /**
   * When the user was deleted, as local time `YYYY-MM-DDTHH:MM:SS` — the same
   * shape the trash hands over, so the web reads it with `formatDateTime`.
   * Null for every user that is not deleted, and for one deleted before
   * migration 018 recorded the moment.
   */
  deletedAt: string | null;
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

/**
 * Lists users with their global roles and account grants. Deleted users
 * (`userStatus = -1`) are left out unless they are asked for: that keeps every
 * existing caller — and the login, the reminders, the pickers — on the set they
 * had, and the one mask that deals with deleted users asks for them (SEC-15).
 */
export async function listUsers(
  pool: Pool,
  options: { includeDeleted?: boolean } = {},
): Promise<AdminUser[]> {
  const users = await pool.query<
    Array<{
      userID: number;
      uuid: string;
      email: string;
      firstname: string;
      surname: string | null;
      status: number;
      deletedAt: string | null;
    }>
  >(
    `SELECT userID, uuidText AS uuid, email, firstname, surname, userStatus AS status,
            DATE_FORMAT(deletedAt, '%Y-%m-%dT%H:%i:%s') AS deletedAt
       FROM Users
      WHERE ${options.includeDeleted === true ? 'TRUE' : 'userStatus <> -1'}
      ORDER BY email`,
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
    deletedAt: u.deletedAt,
    globalRoles: globalRoles.filter((g) => g.userID === u.userID).map((g) => g.roleName),
    accountGrants: grants
      .filter((g) => g.userID === u.userID)
      .map((g) => ({ accountUID: g.accountUID, roleName: g.roleName })),
  }));
}

/** Fetches a single user by UUID with roles/grants, or null. */
export async function getUser(
  pool: Pool,
  uuid: string,
  options: { includeDeleted?: boolean } = {},
): Promise<AdminUser | null> {
  const users = await listUsers(pool, options);
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
  const result = await execute(
    pool,
    `UPDATE Users SET ${columns.join(', ')} WHERE uuidText = ? AND userStatus <> -1`,
    [...values, uuid],
  );
  return result.affectedRows;
}

/**
 * Soft-deletes a user (userStatus = -1) and records when. The moment is what
 * the mask shows and what the retention period counts from (migration 018).
 */
export async function softDeleteUser(pool: Pool, uuid: string): Promise<number> {
  const result = await execute(
    pool,
    `UPDATE Users SET userStatus = -1, deletedAt = NOW(6)
      WHERE uuidText = ? AND userStatus <> -1`,
    [uuid],
  );
  return result.affectedRows;
}

/**
 * Brings a deleted user back — **deactivated**, not active (userStatus = 0).
 * A login that returns must not be live by surprise; whoever restores it can
 * switch it on in the same mask, and that is then a second, deliberate step.
 */
export async function restoreUser(pool: Pool, uuid: string): Promise<number> {
  const result = await execute(
    pool,
    `UPDATE Users SET userStatus = 0, deletedAt = NULL
      WHERE uuidText = ? AND userStatus = -1`,
    [uuid],
  );
  return result.affectedRows;
}

/**
 * Removes a deleted user for good. Only a deleted row can go, so a mistaken
 * call cannot take an active login with it.
 *
 * What hangs on the user is left to the database, which says what it wants
 * itself: `UserRoles`, `UserAccountRoles`, `RefreshTokens` and
 * `InvoiceReminders` cascade (a role assignment or a sent-reminder note means
 * nothing without its user), while `SystemSettings.updatedByUserID` is set to
 * NULL — who last wrote a setting is audit information that deliberately
 * outlives the account (migrations 002, 009, 010).
 */
export async function hardDeleteUser(pool: Pool, uuid: string): Promise<number> {
  const result = await execute(pool, `DELETE FROM Users WHERE uuidText = ? AND userStatus = -1`, [
    uuid,
  ]);
  return result.affectedRows;
}

/**
 * The UUIDs of users deleted before `cutoff` — the candidates of the retention
 * sweep (retention/sweep.ts). As in the trash, a deletion without a recorded
 * moment never ages out.
 */
export async function expiredDeletedUsers(pool: Pool, cutoff: Date): Promise<string[]> {
  const rows = await pool.query<Array<{ uuid: string }>>(
    `SELECT uuidText AS uuid FROM Users
      WHERE userStatus = -1 AND deletedAt IS NOT NULL AND deletedAt < ?
      ORDER BY deletedAt`,
    [cutoff],
  );
  return rows.map((row) => row.uuid);
}

/**
 * The numeric keys the join tables hold, for the role UIDs the admin UI sends.
 * A UID that matches no role is simply absent from the map, and the caller
 * leaves it out — which is what the `INSERT … SELECT … WHERE roleUID = ?` this
 * replaces did, silently and one statement at a time.
 *
 * It has to be a separate lookup: `conn.batch` speaks MariaDB's bulk protocol,
 * and that protocol does not carry `INSERT … SELECT` (error 1295,
 * ER_UNSUPPORTED_PS). So the UIDs are resolved once, up front, instead of once
 * per row.
 */
async function roleIdsByUid(conn: Queryable, roleUIDs: string[]): Promise<Map<string, number>> {
  const rows = await conn.query<Array<{ roleUID: string; roleID: number }>>(
    `SELECT roleUID, roleID FROM Roles WHERE roleUID IN (${placeholders(roleUIDs)})`,
    roleUIDs,
  );
  return new Map(rows.map((row) => [row.roleUID, Number(row.roleID)]));
}

/** Replaces a user's global roles (UserRoles) with the given role UIDs. */
export async function setGlobalRoles(
  pool: Pool,
  userId: number,
  roleUIDs: string[],
): Promise<void> {
  await withTransaction(pool, async (conn) => {
    await conn.query('DELETE FROM UserRoles WHERE userID = ?', [userId]);
    // The empty list is how every role is taken away; then the delete is all.
    if (roleUIDs.length === 0) return;
    const roleIds = await roleIdsByUid(conn, roleUIDs);
    const rows = roleUIDs.flatMap((roleUID) => {
      const roleID = roleIds.get(roleUID);
      return roleID === undefined ? [] : [[userId, roleID]];
    });
    if (rows.length === 0) return;
    await conn.batch('INSERT INTO UserRoles (userID, roleID) VALUES (?, ?)', rows);
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
    if (grants.length === 0) return;
    const roleIds = await roleIdsByUid(
      conn,
      grants.map((grant) => grant.roleUID),
    );
    const rows = grants.flatMap((grant) => {
      const roleID = roleIds.get(grant.roleUID);
      return roleID === undefined ? [] : [[userId, roleID, grant.accountUID]];
    });
    if (rows.length === 0) return;
    await conn.batch(
      'INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)',
      rows,
    );
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
