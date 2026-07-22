import type { Pool } from 'mariadb';

/**
 * Data access for authentication. Every read here selects the internal numeric
 * `userID` for use as a join key inside the process, and the public `uuidText`
 * for anything that leaves it — a caller never sees the enumerable key.
 */

export interface AuthUser {
  userId: number;
  uuidText: string;
  email: string;
  firstname: string;
  surname: string | null;
  userStatus: number;
}

interface UserWithHash extends AuthUser {
  passwordHash: string;
}

interface InsertResult {
  insertId: number;
  affectedRows: number;
}

const USER_COLUMNS = `userID AS userId, uuidText, email, firstname, surname, userStatus`;
const USER_COLUMNS_PREFIXED = `u.userID AS userId, u.uuidText, u.email, u.firstname, u.surname, u.userStatus`;

/** Total number of user rows — used only to gate the one-time setup endpoint. */
export async function countUsers(pool: Pool): Promise<number> {
  const rows = await pool.query<Array<{ total: number }>>('SELECT COUNT(*) AS total FROM Users');
  return rows[0]?.total ?? 0;
}

/** Looks up a user (including the password hash) by email, or null if absent. */
export async function findUserByEmailWithHash(
  pool: Pool,
  email: string,
): Promise<UserWithHash | null> {
  const rows = await pool.query<UserWithHash[]>(
    `SELECT ${USER_COLUMNS}, passwordHash FROM Users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

/** Looks up a user by public UUID, or null if absent. */
export async function findUserByUuid(pool: Pool, uuidText: string): Promise<AuthUser | null> {
  const rows = await pool.query<AuthUser[]>(
    `SELECT ${USER_COLUMNS} FROM Users WHERE uuidText = ? LIMIT 1`,
    [uuidText],
  );
  return rows[0] ?? null;
}

/** Inserts a user (DB generates the UUID) and returns the created row. */
export async function createUser(
  pool: Pool,
  user: { email: string; firstname: string; surname: string | null; passwordHash: string },
): Promise<AuthUser> {
  const result = (await pool.query(
    `INSERT INTO Users (email, firstname, surname, passwordHash) VALUES (?, ?, ?, ?)`,
    [user.email, user.firstname, user.surname, user.passwordHash],
  )) as InsertResult;

  const rows = await pool.query<AuthUser[]>(
    `SELECT ${USER_COLUMNS} FROM Users WHERE userID = ?`,
    [result.insertId],
  );
  const created = rows[0];
  if (!created) throw new Error('User row vanished immediately after insert');
  return created;
}

/** Grants a named role globally (via UserRoles). Returns false if the role is unknown. */
export async function assignGlobalRole(
  pool: Pool,
  userId: number,
  roleName: string,
): Promise<boolean> {
  const result = (await pool.query(
    `INSERT INTO UserRoles (userID, roleID)
     SELECT ?, roleID FROM Roles WHERE roleName = ?`,
    [userId, roleName],
  )) as InsertResult;
  return result.affectedRows > 0;
}

/** Persists a refresh token (only its hash) for a user with an absolute expiry. */
export async function insertRefreshToken(
  pool: Pool,
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO RefreshTokens (userID, tokenHash, expiresAt) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
  );
}

/**
 * Finds the user behind a refresh-token hash, but only while the token is
 * still valid (not revoked, not expired). Returns null otherwise.
 */
export async function findUserByValidRefreshToken(
  pool: Pool,
  tokenHash: string,
): Promise<AuthUser | null> {
  const rows = await pool.query<AuthUser[]>(
    `SELECT ${USER_COLUMNS_PREFIXED}
       FROM RefreshTokens t
       JOIN Users u ON u.userID = t.userID
      WHERE t.tokenHash = ? AND t.revokedAt IS NULL AND t.expiresAt >= NOW()
      LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Marks a refresh token revoked. Idempotent — revoking twice is harmless. */
export async function revokeRefreshToken(pool: Pool, tokenHash: string): Promise<void> {
  await pool.query(
    `UPDATE RefreshTokens SET revokedAt = NOW() WHERE tokenHash = ? AND revokedAt IS NULL`,
    [tokenHash],
  );
}
