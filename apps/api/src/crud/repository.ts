import type { Pool, PoolConnection } from 'mariadb';

import { type EntityName, generateEntityId } from '../lib/ids.js';

/**
 * Describes a soft-deletable table for the generic CRUD helpers. The numeric
 * auto-increment key is never listed and never selected — only the public
 * `uidColumn`, the writable business `columns`, and the `statusColumn` leave
 * the database.
 */
export interface CrudTable {
  table: string;
  uidColumn: string;
  statusColumn: string;
  entity: EntityName;
  /** Writable business columns (excludes the numeric key, the UID and status). */
  columns: string[];
}

export type Row = Record<string, unknown>;

/** A pool or a single (transaction-bound) connection — both expose `query`. */
export type Queryable = Pool | PoolConnection;

/** Optional extra WHERE fragment (ANDed in) used for account-scoped listing. */
export interface Filter {
  clause: string;
  params: unknown[];
}

const STATUS_DELETED = -1;
const STATUS_ACTIVE = 1;
/**
 * The deletion timestamp, spelled the same on every table (unlike the prefixed
 * status columns) — added by migration 013 for the trash.
 */
const DELETED_AT = 'deletedAt';

interface InsertResult {
  insertId: number;
  affectedRows: number;
}

function outputColumns(t: CrudTable): string {
  return [t.uidColumn, ...t.columns, t.statusColumn].join(', ');
}

/** Keeps only entries whose key is a known writable column of the table. */
function pickColumns(
  t: CrudTable,
  data: Record<string, unknown>,
): [columns: string[], values: unknown[]] {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const column of t.columns) {
    if (Object.prototype.hasOwnProperty.call(data, column)) {
      columns.push(column);
      values.push(data[column]);
    }
  }
  return [columns, values];
}

/** Lists non-deleted rows, optionally narrowed by an account-scope filter. */
export async function listRows(pool: Queryable, t: CrudTable, filter?: Filter): Promise<Row[]> {
  const where = [`${t.statusColumn} <> ?`];
  const params: unknown[] = [STATUS_DELETED];
  if (filter) {
    where.push(filter.clause);
    params.push(...filter.params);
  }
  return pool.query<Row[]>(
    `SELECT ${outputColumns(t)} FROM ${t.table} WHERE ${where.join(' AND ')} ORDER BY ${t.uidColumn}`,
    params,
  );
}

/** Fetches a single non-deleted row by its UID, or null. */
export async function getRow(pool: Queryable, t: CrudTable, uid: string): Promise<Row | null> {
  const rows = await pool.query<Row[]>(
    `SELECT ${outputColumns(t)} FROM ${t.table} WHERE ${t.uidColumn} = ? AND ${t.statusColumn} <> ? LIMIT 1`,
    [uid, STATUS_DELETED],
  );
  return rows[0] ?? null;
}

/** Inserts a row (generating its UID) and returns the created row. */
export async function insertRow(
  pool: Queryable,
  t: CrudTable,
  data: Record<string, unknown>,
): Promise<Row> {
  const uid = generateEntityId(t.entity);
  const [columns, values] = pickColumns(t, data);
  const allColumns = [t.uidColumn, ...columns];
  const placeholders = allColumns.map(() => '?').join(', ');
  await pool.query(`INSERT INTO ${t.table} (${allColumns.join(', ')}) VALUES (${placeholders})`, [
    uid,
    ...values,
  ]);
  const created = await getRow(pool, t, uid);
  if (!created) throw new Error(`Row ${uid} vanished immediately after insert into ${t.table}`);
  return created;
}

/**
 * Updates the given columns of a non-deleted row. Returns the updated row, or
 * null if no such row exists (so the caller can answer 404).
 */
export async function updateRow(
  pool: Queryable,
  t: CrudTable,
  uid: string,
  data: Record<string, unknown>,
): Promise<Row | null> {
  const [columns, values] = pickColumns(t, data);
  if (columns.length > 0) {
    const assignments = columns.map((c) => `${c} = ?`).join(', ');
    await pool.query(
      `UPDATE ${t.table} SET ${assignments} WHERE ${t.uidColumn} = ? AND ${t.statusColumn} <> ?`,
      [...values, uid, STATUS_DELETED],
    );
  }
  return getRow(pool, t, uid);
}

/**
 * The database's clock as a `YYYY-MM-DD HH:MM:SS` string — the moment a
 * deletion is stamped with, down to the microsecond. Read once so a cascade can
 * write the SAME instant into every row it touches: that shared timestamp is
 * what makes the rows one deletion *batch*, and the trash restores exactly a
 * batch (see domain/trash). Microseconds because the timestamp is an identity,
 * not a display value — two deletions a millisecond apart are two batches. The
 * clock is the server's, like `NOW()`/`CURDATE()` everywhere else.
 */
export async function deletionTimestamp(pool: Queryable): Promise<string> {
  const rows = await pool.query<Array<{ ts: string }>>(
    "SELECT DATE_FORMAT(NOW(6), '%Y-%m-%d %H:%i:%s.%f') AS ts",
  );
  const stamp = rows[0]?.ts;
  if (stamp === undefined) throw new Error('The database did not answer with its current time');
  return stamp;
}

/**
 * Soft-deletes a row (status = -1) and stamps `deletedAt`. Returns false if it
 * did not exist / was already deleted. `at` lets a cascade share one timestamp
 * (see `deletionTimestamp`); left out, the row is stamped with the database's
 * time of this statement.
 */
export async function softDeleteRow(
  pool: Queryable,
  t: CrudTable,
  uid: string,
  at?: string,
): Promise<boolean> {
  const result = (await pool.query(
    `UPDATE ${t.table} SET ${t.statusColumn} = ?, ${DELETED_AT} = ${at === undefined ? 'NOW(6)' : '?'}
      WHERE ${t.uidColumn} = ? AND ${t.statusColumn} <> ?`,
    at === undefined
      ? [STATUS_DELETED, uid, STATUS_DELETED]
      : [STATUS_DELETED, at, uid, STATUS_DELETED],
  )) as InsertResult;
  return result.affectedRows > 0;
}

/** Fetches a single DELETED row by its UID, or null — the trash's counterpart to `getRow`. */
export async function getDeletedRow(
  pool: Queryable,
  t: CrudTable,
  uid: string,
): Promise<Row | null> {
  const rows = await pool.query<Row[]>(
    `SELECT ${outputColumns(t)}, ${DELETED_AT} FROM ${t.table}
      WHERE ${t.uidColumn} = ? AND ${t.statusColumn} = ? LIMIT 1`,
    [uid, STATUS_DELETED],
  );
  return rows[0] ?? null;
}

/**
 * Brings a deleted row back and clears its `deletedAt`. Status 1, not 0:
 * nothing in the application ever writes the "inactive" status, so active is
 * the only state a row can return to. Returns false when there was no deleted
 * row under that UID.
 */
export async function restoreRow(pool: Queryable, t: CrudTable, uid: string): Promise<boolean> {
  const result = (await pool.query(
    `UPDATE ${t.table} SET ${t.statusColumn} = ?, ${DELETED_AT} = NULL
      WHERE ${t.uidColumn} = ? AND ${t.statusColumn} = ?`,
    [STATUS_ACTIVE, uid, STATUS_DELETED],
  )) as InsertResult;
  return result.affectedRows > 0;
}

/**
 * Removes a row for good. Only ever a deleted one: the status condition makes
 * it impossible for a bug in a caller to hard-delete a live record.
 */
export async function hardDeleteRow(pool: Queryable, t: CrudTable, uid: string): Promise<boolean> {
  const result = (await pool.query(
    `DELETE FROM ${t.table} WHERE ${t.uidColumn} = ? AND ${t.statusColumn} = ?`,
    [uid, STATUS_DELETED],
  )) as InsertResult;
  return result.affectedRows > 0;
}
