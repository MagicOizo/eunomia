import type { Pool, PoolConnection, UpsertResult } from 'mariadb';

import { type EntityName, generateEntityId } from '../lib/ids.js';

/**
 * Describes a soft-deletable table for the generic CRUD helpers. The numeric
 * auto-increment key is never listed and never selected — only the public
 * `uidColumn`, the writable business `columns`, and the `statusColumn` leave
 * the database.
 *
 * `R` is the shape of a row of this table. A description is written with
 * `crudTable()`, which is where that shape is checked against the column list;
 * from there on the helpers below hand `R` to the driver's type parameter
 * instead of casting their result (CR-19). A table whose rows nobody reads
 * field by field leaves `R` out and keeps the untyped `Row`.
 */
export interface CrudTable<R extends Row = Row> {
  table: string;
  uidColumn: string;
  statusColumn: string;
  entity: EntityName;
  /** Writable business columns (excludes the numeric key, the UID and status). */
  readonly columns: readonly string[];
  /**
   * The row shape, so that `getRow` and its siblings can read it off the
   * description. It exists in the type only: `crudTable()` does not write it
   * and nothing ever reads it. It has to be a field the table *has* rather
   * than `keyof R` inside `columns`, because only then is the description of a
   * typed table also one of an untyped `Row` — which the trash needs, holding
   * all eleven of them in one list.
   */
  readonly row?: R;
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

function outputColumns(t: CrudTable<Row>): string {
  return [t.uidColumn, ...t.columns, t.statusColumn].join(', ');
}

/**
 * `?, ?, ?` for a list of values — the bound form of an `IN (…)` list and of
 * the column list of a `VALUES (…)`. Written out by hand in a dozen places
 * before, which is a dozen chances to get the count wrong (CR-16/CR-17).
 */
export function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

/**
 * Writes a table description, with its row type if it has one.
 *
 * This is the one place where the shape of a row is claimed, and the claim is
 * checked here: `columns` may only name keys of `R`, so a column the row type
 * does not know — a typo, or a rename done on one side only — does not
 * compile. Without a type argument `R` stays `Row` and the check is vacuous,
 * which is what a table nobody reads field by field wants.
 *
 * A row type has to be written as a type alias, not an interface: TypeScript
 * gives an implicit index signature to an object type literal and not to an
 * interface, and only with one does a row count as a `Row`.
 */
export function crudTable<R extends Row = Row>(t: {
  table: string;
  uidColumn: string;
  statusColumn: string;
  entity: EntityName;
  columns: ReadonlyArray<keyof R & string>;
}): CrudTable<R> {
  return t;
}

/**
 * What a write answers: how many rows it changed, and the key it created.
 *
 * The driver's own `UpsertResult` spells `insertId` as `number | bigint`
 * because it does not know the pool's settings; ours runs on
 * `bigIntAsNumber` (see db/pool.ts), so the number here is a conversion of
 * what arrived, not an assertion about it.
 */
export interface WriteResult {
  affectedRows: number;
  insertId: number;
}

/**
 * Runs a write statement (INSERT/UPDATE/DELETE) and returns its result. The
 * point is the type: `query` without a type parameter answers `any`, and a
 * dozen places used to pull the two fields they wanted back out of it with an
 * assertion (CR-19).
 */
export async function execute(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<WriteResult> {
  const result = await db.query<UpsertResult>(sql, params);
  return { affectedRows: result.affectedRows, insertId: Number(result.insertId) };
}

/** Keeps only entries whose key is a known writable column of the table. */
function pickColumns(
  t: CrudTable<Row>,
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
export async function listRows<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  filter?: Filter,
): Promise<R[]> {
  const where = [`${t.statusColumn} <> ?`];
  const params: unknown[] = [STATUS_DELETED];
  if (filter) {
    where.push(filter.clause);
    params.push(...filter.params);
  }
  return pool.query<R[]>(
    `SELECT ${outputColumns(t)} FROM ${t.table} WHERE ${where.join(' AND ')} ORDER BY ${t.uidColumn}`,
    params,
  );
}

/** Fetches a single non-deleted row by its UID, or null. */
export async function getRow<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  uid: string,
): Promise<R | null> {
  const rows = await pool.query<R[]>(
    `SELECT ${outputColumns(t)} FROM ${t.table} WHERE ${t.uidColumn} = ? AND ${t.statusColumn} <> ? LIMIT 1`,
    [uid, STATUS_DELETED],
  );
  return rows[0] ?? null;
}

/** Inserts a row (generating its UID) and returns the created row. */
export async function insertRow<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  data: Record<string, unknown>,
): Promise<R> {
  const uid = generateEntityId(t.entity);
  const [columns, values] = pickColumns(t, data);
  const allColumns = [t.uidColumn, ...columns];
  await pool.query(
    `INSERT INTO ${t.table} (${allColumns.join(', ')}) VALUES (${placeholders(allColumns)})`,
    [uid, ...values],
  );
  const created = await getRow(pool, t, uid);
  if (!created) throw new Error(`Row ${uid} vanished immediately after insert into ${t.table}`);
  return created;
}

/**
 * Inserts several rows in ONE round trip, and returns them in the order they
 * were given.
 *
 * Why it exists: inserting a list in a loop costs two round trips per entry,
 * and for a service billing that answers thirty invoices those thirty pairs run
 * while every invoice it touches is locked FOR UPDATE (CR-18, SEC-11). The same
 * list is bounded in the schema; this is the other half of that.
 *
 * One statement means one column list for every row, so the columns are the
 * union over all rows — a key missing from a row is written as NULL, not left
 * to the column's default. A row from a request is a parsed schema, where an
 * optional field is simply absent, and NULL is what it would have become
 * anyway; a column whose default is something else has to be set explicitly.
 *
 * Atomicity is the caller's, exactly as with `insertRow`: pass the connection of
 * an open transaction, not the pool, when all the rows have to land together.
 */
export async function insertManyRows<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  rows: Array<Record<string, unknown>>,
): Promise<R[]> {
  if (rows.length === 0) return [];

  const columns = t.columns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)),
  );
  const allColumns = [t.uidColumn, ...columns];
  const uids = rows.map(() => generateEntityId(t.entity));
  await pool.batch(
    `INSERT INTO ${t.table} (${allColumns.join(', ')}) VALUES (${placeholders(allColumns)})`,
    rows.map((row, index) => [uids[index], ...columns.map((column) => row[column] ?? null)]),
  );

  const created = await pool.query<R[]>(
    `SELECT ${outputColumns(t)} FROM ${t.table}
      WHERE ${t.uidColumn} IN (${placeholders(uids)})`,
    uids,
  );
  const byUid = new Map(created.map((row) => [row[t.uidColumn], row]));
  return uids.map((uid) => {
    const row = byUid.get(uid);
    if (!row) throw new Error(`Row ${uid} vanished immediately after insert into ${t.table}`);
    return row;
  });
}

/**
 * Updates the given columns of a non-deleted row. Returns the updated row, or
 * null if no such row exists (so the caller can answer 404).
 */
export async function updateRow<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  uid: string,
  data: Record<string, unknown>,
): Promise<R | null> {
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
  t: CrudTable<Row>,
  uid: string,
  at?: string,
): Promise<boolean> {
  const result = await execute(
    pool,
    `UPDATE ${t.table} SET ${t.statusColumn} = ?, ${DELETED_AT} = ${at === undefined ? 'NOW(6)' : '?'}
      WHERE ${t.uidColumn} = ? AND ${t.statusColumn} <> ?`,
    at === undefined
      ? [STATUS_DELETED, uid, STATUS_DELETED]
      : [STATUS_DELETED, at, uid, STATUS_DELETED],
  );
  return result.affectedRows > 0;
}

/** Fetches a single DELETED row by its UID, or null — the trash's counterpart to `getRow`. */
export async function getDeletedRow<R extends Row>(
  pool: Queryable,
  t: CrudTable<R>,
  uid: string,
): Promise<R | null> {
  const rows = await pool.query<R[]>(
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
export async function restoreRow(
  pool: Queryable,
  t: CrudTable<Row>,
  uid: string,
): Promise<boolean> {
  const result = await execute(
    pool,
    `UPDATE ${t.table} SET ${t.statusColumn} = ?, ${DELETED_AT} = NULL
      WHERE ${t.uidColumn} = ? AND ${t.statusColumn} = ?`,
    [STATUS_ACTIVE, uid, STATUS_DELETED],
  );
  return result.affectedRows > 0;
}

/**
 * Removes a row for good. Only ever a deleted one: the status condition makes
 * it impossible for a bug in a caller to hard-delete a live record.
 */
export async function hardDeleteRow(
  pool: Queryable,
  t: CrudTable<Row>,
  uid: string,
): Promise<boolean> {
  const result = await execute(
    pool,
    `DELETE FROM ${t.table} WHERE ${t.uidColumn} = ? AND ${t.statusColumn} = ?`,
    [uid, STATUS_DELETED],
  );
  return result.affectedRows > 0;
}
