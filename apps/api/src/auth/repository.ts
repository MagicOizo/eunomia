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

/** Reads just the stored password hash of a user, or null if the user is gone. */
export async function findPasswordHashByUserId(pool: Pool, userId: number): Promise<string | null> {
  const rows = await pool.query<Array<{ passwordHash: string }>>(
    'SELECT passwordHash FROM Users WHERE userID = ? LIMIT 1',
    [userId],
  );
  return rows[0]?.passwordHash ?? null;
}

/** Writes a new password hash for a user. The caller revokes the sessions. */
export async function updatePasswordHash(
  pool: Pool,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await pool.query('UPDATE Users SET passwordHash = ? WHERE userID = ?', [passwordHash, userId]);
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

  const rows = await pool.query<AuthUser[]>(`SELECT ${USER_COLUMNS} FROM Users WHERE userID = ?`, [
    result.insertId,
  ]);
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
  await pool.query(`INSERT INTO RefreshTokens (userID, tokenHash, expiresAt) VALUES (?, ?, ?)`, [
    userId,
    tokenHash,
    expiresAt,
  ]);
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

/**
 * Finds the owner of a refresh-token hash regardless of the token's state —
 * the counterpart to findUserByValidRefreshToken without its validity filter.
 * Only this tells an unknown token apart from a revoked one, which is what the
 * reuse detection in service.ts turns into a conclusion.
 */
export async function findRefreshTokenOwner(
  pool: Pool,
  tokenHash: string,
): Promise<{ userId: number; uuidText: string; revokedAt: Date | null } | null> {
  const rows = await pool.query<
    Array<{ userId: number; uuidText: string; revokedAt: Date | null }>
  >(
    `SELECT t.userID AS userId, u.uuidText, t.revokedAt
       FROM RefreshTokens t
       JOIN Users u ON u.userID = t.userID
      WHERE t.tokenHash = ?
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

/**
 * Ends every still-valid session of a user, optionally sparing one — the one
 * that asked. The lever behind "a new password ends the other sessions" and
 * behind the reuse detection dropping a whole token chain. Returns how many
 * sessions went, so the caller can say so in a log line.
 *
 * Deletes rather than revokes, and that is the point: a revoked row that is
 * presented again is read as a stolen token (findRefreshTokenOwner). A session
 * ended on purpose is not a theft — were these rows merely revoked, the next
 * refresh of some other browser of the same user would raise the alarm and
 * take down the very session this call just spared. Nothing is lost by the
 * delete either: the row proves nothing once its chain is gone.
 */
export async function deleteActiveRefreshTokens(
  pool: Pool,
  userId: number,
  exceptTokenHash?: string,
): Promise<number> {
  const spare = exceptTokenHash === undefined ? '' : ' AND tokenHash <> ?';
  const values: unknown[] = exceptTokenHash === undefined ? [userId] : [userId, exceptTokenHash];
  const result = (await pool.query(
    `DELETE FROM RefreshTokens WHERE userID = ? AND revokedAt IS NULL${spare}`,
    values,
  )) as { affectedRows: number };
  return result.affectedRows;
}

/**
 * Deletes refresh-token rows that are past all use. A row goes when it can
 * neither be exchanged nor prove a theft any more:
 *
 *  - revoked longer ago than `revokedBefore`, or
 *  - expired and never revoked.
 *
 * The grace period for revoked rows is not politeness, it is the detection
 * window of SEC-07: delete the row the moment it is revoked and a reused token
 * is merely "unknown" again. Returns the number of rows removed.
 */
export async function deleteStaleRefreshTokens(
  pool: Pool,
  now: Date,
  revokedBefore: Date,
): Promise<number> {
  const result = (await pool.query(
    `DELETE FROM RefreshTokens
      WHERE (revokedAt IS NOT NULL AND revokedAt < ?)
         OR (revokedAt IS NULL AND expiresAt < ?)`,
    [revokedBefore, now],
  )) as { affectedRows: number };
  return result.affectedRows;
}
