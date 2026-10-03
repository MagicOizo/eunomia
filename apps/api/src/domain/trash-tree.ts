import { type Queryable, type Row, placeholders } from '../crud/repository.js';
import { addTo, groupBy } from '../lib/group.js';
import { linksTo } from './trash-references.js';
import { type TrashEntity, type TrashEntry, entityOfTable } from './trash-registry.js';

/**
 * The reading half of the Papierkorb: it locates deleted rows, descends the
 * foreign keys below them and counts what holds on to them. What that means for
 * the page, for a restore or for a purge is decided in `trash.ts`.
 *
 * Every question is asked per kind and per level, never per record (CR-17).
 * Before, one page of the trash cost one recursive descent and a handful of
 * count queries *for each entry* — around ten queries for a single invoice, so
 * several hundred round trips for fifty entries. The descent now reads the
 * foreign keys of a whole level at once and walks the resulting tree in memory,
 * which is why the page of a long trash costs the same as the page of a short
 * one. With the retention period of SEC-15 the trash will be long by design.
 */

/** A located row: which entity it belongs to, its UID and what it says. */
export interface Located {
  entity: TrashEntity;
  uid: string;
  row: Row;
  entry: TrashEntry;
}

/** A counted mention of something, in the right German number. */
export interface Counted {
  label: string;
  count: number;
}

const counted = (names: { one: string; many: string }, count: number): Counted => ({
  label: count === 1 ? names.one : names.many,
  count,
});

/** Rows that are not records of their own but go with the record they belong to. */
const ATTACHED_ROW_NAMES: Record<string, { one: string; many: string }> = {
  SubmissionInvoices: { one: 'Rechnung in einer Einreichung', many: 'Rechnungen in Einreichungen' },
  InvoiceExclusions: {
    one: 'Markierung „nicht erstattungsfähig“',
    many: 'Markierungen „nicht erstattungsfähig“',
  },
  ContractBonusTiers: { one: 'Stufe der Bonus-Staffel', many: 'Stufen der Bonus-Staffel' },
  ContractYears: { one: 'Versicherungsjahr', many: 'Versicherungsjahre' },
  UserAccountRoles: { one: 'Rechte-Zuweisung', many: 'Rechte-Zuweisungen' },
  InvoiceReminders: { one: 'Zahlungserinnerung', many: 'Zahlungserinnerungen' },
};

const describe = (entity: TrashEntity, row: Row): TrashEntry => ({
  uid: String(row.uid),
  deletedAt: row.deletedAt === null || row.deletedAt === undefined ? null : String(row.deletedAt),
  ...entity.describe(row),
});

/** The deletion batch a row belongs to, or null for a row deleted before Slice 39. */
export const batchOf = (located: Located): string | null =>
  located.row.batch === null || located.row.batch === undefined ? null : String(located.row.batch);

const locate = (entity: TrashEntity, row: Row): Located => ({
  entity,
  uid: String(row.uid),
  row,
  entry: describe(entity, row),
});

/** A record's place in the walk; the table keeps two kinds of UID apart. */
const markerOf = (located: Located): string => `${located.entity.table.table}:${located.uid}`;

/** One deleted row of an entity, or null. */
export async function loadOne(
  db: Queryable,
  entity: TrashEntity,
  uid: string,
): Promise<Located | null> {
  const rows = await db.query<Row[]>(
    `${entity.listSql} AND ${entity.alias}.${entity.table.uidColumn} = ? LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  return row === undefined ? null : locate(entity, row);
}

/** Every deleted row of an entity, newest deletion first (undated ones last). */
export async function loadAll(db: Queryable, entity: TrashEntity): Promise<Located[]> {
  const rows = await db.query<Row[]>(
    `${entity.listSql} ORDER BY ${entity.alias}.deletedAt DESC, uid`,
  );
  return rows.map((row) => locate(entity, row));
}

/** Who hangs on whom: the marker of a record against its deleted children. */
export type ChildMap = Map<string, Located[]>;

/** The deleted rows of one kind named by their UIDs. */
async function rowsOf(
  db: Queryable,
  entity: TrashEntity,
  uids: string[],
): Promise<Map<string, Row>> {
  const rows = await db.query<Row[]>(
    `${entity.listSql} AND ${entity.alias}.${entity.table.uidColumn} IN (${placeholders(uids)})`,
    uids,
  );
  return new Map(rows.map((row) => [String(row.uid), row]));
}

/**
 * Who hangs below the given records, level by level until a level stays empty.
 *
 * Two queries per foreign key and level rather than one, because `listSql` ends
 * on its status condition: a caller cannot add the column a child hangs on to
 * its SELECT, and only some kinds carry it anyway. So the pairs UID → parent
 * come from the child's own table first, and the rows the page shows follow per
 * kind. Everything a caller needs about ancestry is in the returned map; the
 * walk itself (`descendantsOf`) asks nothing.
 */
export async function childEdges(db: Queryable, roots: readonly Located[]): Promise<ChildMap> {
  const edges: ChildMap = new Map();
  const expanded = new Set(roots.map(markerOf));
  let level: Located[] = [...roots];

  while (level.length > 0) {
    /** Per child kind: which UID hangs on which parent marker, in link order. */
    const pairsByEntity = new Map<TrashEntity, Array<{ uid: string; parent: string }>>();

    for (const [parentEntity, parents] of groupBy(level, (one) => one.entity)) {
      const uids = parents.map((one) => one.uid);
      for (const link of await linksTo(
        db,
        parentEntity.table.table,
        parentEntity.table.uidColumn,
      )) {
        const entity = entityOfTable(link.table);
        if (!entity) continue;
        const pairs = await db.query<Array<{ uid: string; parent: string }>>(
          `SELECT ${entity.table.uidColumn} AS uid, ${link.column} AS parent
             FROM ${entity.table.table}
            WHERE ${link.column} IN (${placeholders(uids)}) AND ${entity.table.statusColumn} = -1
            ORDER BY ${entity.table.uidColumn}`,
          uids,
        );
        for (const pair of pairs) {
          addTo(pairsByEntity, entity, {
            uid: String(pair.uid),
            parent: `${parentEntity.table.table}:${String(pair.parent)}`,
          });
        }
      }
    }

    const next: Located[] = [];
    for (const [entity, pairs] of pairsByEntity) {
      const rows = await rowsOf(db, entity, [...new Set(pairs.map((pair) => pair.uid))]);
      for (const pair of pairs) {
        const row = rows.get(pair.uid);
        if (!row) continue;
        const child = locate(entity, row);
        addTo(edges, pair.parent, child);
        const marker = markerOf(child);
        if (expanded.has(marker)) continue;
        expanded.add(marker);
        next.push(child);
      }
    }
    level = next;
  }
  return edges;
}

/**
 * All deleted records below one record, children before parents — the order a
 * purge needs and a restore reverses.
 *
 * `batch` narrows the walk to one deletion moment, which is what a cascade left
 * behind and therefore exactly what a restore reverses: only a child carrying
 * that same batch is taken, and only through such a child does the walk go on.
 * A row deleted before Slice 39 has no batch at all and so has no batch
 * children — the SQL this replaced compared `DATE_FORMAT(…) = NULL`, which is
 * never true, so `null` must not match `null` here either.
 *
 * The `seen` set keeps the self-reference of `Accounts.leadAccountUID` from
 * turning into a loop.
 */
export function descendantsOf(root: Located, edges: ChildMap, batch?: string | null): Located[] {
  const seen = new Set([markerOf(root)]);
  const walk = (parent: Located): Located[] => {
    const found: Located[] = [];
    for (const child of edges.get(markerOf(parent)) ?? []) {
      if (batch !== undefined && (batch === null || batchOf(child) !== batch)) continue;
      const marker = markerOf(child);
      if (seen.has(marker)) continue;
      seen.add(marker);
      found.push(...walk(child), child);
    }
    return found;
  };
  return walk(root);
}

/** `descendantsOf` for a single record, for the paths that hold just one. */
export async function deletedDescendants(
  db: Queryable,
  parent: Located,
  batch?: string | null,
): Promise<Located[]> {
  return descendantsOf(parent, await childEdges(db, [parent]), batch);
}

/**
 * The attached rows of each record: link-table rows that are no records of
 * their own (an invoice in a submission, a reminder, a bonus tier) and go with
 * the record they belong to. One grouped count per link table for all the
 * records of a kind, instead of one count per record.
 */
export async function attachedCounts(
  db: Queryable,
  entity: TrashEntity,
  entries: readonly Located[],
): Promise<Map<string, Counted[]>> {
  const counts = new Map<string, Counted[]>();
  if (entries.length === 0) return counts;
  const uids = entries.map((one) => one.uid);

  for (const link of await linksTo(db, entity.table.table, entity.table.uidColumn)) {
    if (entityOfTable(link.table)) continue;
    const names = ATTACHED_ROW_NAMES[link.table];
    if (!names) continue;
    const rows = await db.query<Array<{ parent: string; n: number }>>(
      `SELECT ${link.column} AS parent, COUNT(*) AS n FROM ${link.table}
        WHERE ${link.column} IN (${placeholders(uids)})
        GROUP BY ${link.column}`,
      uids,
    );
    for (const row of rows) {
      const n = Number(row.n);
      if (n > 0) addTo(counts, String(row.parent), counted(names, n));
    }
  }
  return counts;
}

/**
 * What still ACTIVELY points at this record (or at one of the deleted records
 * below it) and therefore stops it from being removed for good. Counted per
 * kind, so the sentence reads "2 Rechnungen, 1 Police".
 *
 * The counts stay per record: this hangs on purging one record, not on the
 * page, and the walk is bounded by that record's own subtree.
 */
export async function blockers(db: Queryable, located: Located): Promise<Counted[]> {
  const tally = new Map<string, { entity: TrashEntity; count: number }>();
  const edges = await childEdges(db, [located]);

  for (const current of [located, ...descendantsOf(located, edges)]) {
    for (const link of await linksTo(
      db,
      current.entity.table.table,
      current.entity.table.uidColumn,
    )) {
      const entity = entityOfTable(link.table);
      if (!entity) continue;
      const rows = await db.query<Array<{ n: number }>>(
        `SELECT COUNT(*) AS n FROM ${link.table}
          WHERE ${link.column} = ? AND ${entity.table.statusColumn} <> -1`,
        [current.uid],
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) {
        const seenBefore = tally.get(entity.key);
        tally.set(entity.key, { entity, count: (seenBefore?.count ?? 0) + n });
      }
    }
  }
  return [...tally.values()].map(({ entity, count }) =>
    counted({ one: entity.singular, many: entity.plural }, count),
  );
}
