import type { Queryable } from '../crud/repository.js';

/**
 * Who hangs on whom, read from the database's own foreign keys rather than from
 * a hand-written list (see Notes/eunomia-plan.md, Slice 39). The trash has to
 * answer two questions for any record: what would be left dangling if it went
 * for good, and what has to come back before it can be restored. Both follow
 * from the constraints, so deriving them here means a new table or a new
 * reference cannot quietly fall out of the rules — the schema IS the rule.
 */

/** One foreign key, one column: child.column → parent.referencedColumn. */
export interface ForeignKeyLink {
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  /** Whether the reference is optional (a NULL-able column). */
  nullable: boolean;
  /** `RESTRICT`, `CASCADE`, `SET NULL`, `NO ACTION` — what a hard delete triggers. */
  deleteRule: string;
}

interface LinkRow {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  nullable: string;
  deleteRule: string;
}

/**
 * The whole schema's foreign keys, read once per database and kept for the
 * process: they only change with a migration, and a restart follows one.
 */
const cache = new Map<string, Promise<ForeignKeyLink[]>>();

async function fetchLinks(db: Queryable): Promise<ForeignKeyLink[]> {
  const rows = await db.query<LinkRow[]>(
    `SELECT k.TABLE_NAME AS childTable, k.COLUMN_NAME AS childColumn,
            k.REFERENCED_TABLE_NAME AS parentTable, k.REFERENCED_COLUMN_NAME AS parentColumn,
            c.IS_NULLABLE AS nullable, r.DELETE_RULE AS deleteRule
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME
        AND c.COLUMN_NAME = k.COLUMN_NAME
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  return rows.map((row) => ({
    table: row.childTable,
    column: row.childColumn,
    referencedTable: row.parentTable,
    referencedColumn: row.parentColumn,
    nullable: row.nullable === 'YES',
    deleteRule: row.deleteRule,
  }));
}

/** All foreign keys of the current schema (cached per database name). */
export async function schemaLinks(db: Queryable): Promise<ForeignKeyLink[]> {
  const rows = await db.query<Array<{ name: string }>>('SELECT DATABASE() AS name');
  const name = rows[0]?.name ?? '';
  const cached = cache.get(name);
  if (cached) return cached;
  // The promise goes into the cache, not its result: two concurrent requests
  // then share one round trip instead of both querying information_schema.
  const pending = fetchLinks(db);
  cache.set(name, pending);
  try {
    return await pending;
  } catch (error) {
    cache.delete(name);
    throw error;
  }
}

/** Every reference POINTING AT the given table's column (its dependents). */
export async function linksTo(
  db: Queryable,
  table: string,
  column: string,
): Promise<ForeignKeyLink[]> {
  const links = await schemaLinks(db);
  return links.filter((link) => link.referencedTable === table && link.referencedColumn === column);
}

/** Every reference the given table HOLDS (its ancestors). */
export async function linksFrom(db: Queryable, table: string): Promise<ForeignKeyLink[]> {
  const links = await schemaLinks(db);
  return links.filter((link) => link.table === table);
}

/** Forgets the cached schema — for tests that migrate a database up and down. */
export function forgetSchemaLinks(): void {
  cache.clear();
}
