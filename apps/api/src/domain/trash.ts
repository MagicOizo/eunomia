import { ERROR_CODES } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import {
  type Queryable,
  type Row,
  hardDeleteRow,
  restoreRow,
  softDeleteRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError, conflict, notFound } from '../lib/api-error.js';
import { linksFrom, linksTo } from './trash-references.js';
import {
  BATCH_OF,
  type TrashEntity,
  type TrashEntry,
  TRASH_ENTITIES,
  entityOfTable,
  entityOfUid,
} from './trash-registry.js';

/**
 * The Papierkorb (see Notes/eunomia-plan.md, Slice 39). Everything the app
 * deletes is soft-deleted; here it becomes visible, comes back, or goes for
 * good. Three rules carry the whole module:
 *
 *  - **A restore is all or nothing.** One transaction covers the record and the
 *    rows deleted in the same batch with it (same `deletedAt`, see
 *    `deletionTimestamp`); if any of them fails a rule, nothing moves, and the
 *    error names the record it hung on — even when that is a child.
 *  - **A restore never produces a state a mask forbids.** The uniqueness and
 *    domain checks the forms use run first (`assertRestorable` in the registry),
 *    and a unique violation that slips through anyway is caught and translated
 *    rather than leaking as a driver error.
 *  - **Deleting for good takes along what hangs on the record and is itself in
 *    the trash**, plus the link rows that are not records of their own. It is
 *    refused only while something ACTIVE still points at it, and then the
 *    answer says what.
 *
 * Not account-scoped: it is an administrative view behind `MANAGE_TRASH`. A
 * deleted record's own account link may be deleted too, so there is nothing
 * left to scope by.
 */

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

/** A counted mention of something, in the right German number. */
interface Counted {
  label: string;
  count: number;
}

const counted = (names: { one: string; many: string }, count: number): Counted => ({
  label: count === 1 ? names.one : names.many,
  count,
});

/** One deleted record, ready for the UI. */
export interface TrashEntryDto extends TrashEntry {
  restorable: boolean;
  restoreNote: string | null;
  /** Deleted records that go with it when it is removed for good. */
  attached: Array<{ singular: string; plural: string; label: string }>;
  /** Attached rows that are not records of their own (links, reminders, grants). */
  attachedRows: Counted[];
  /** How many of `attached` come back together with it (same deletion batch). */
  restoresWith: number;
}

export interface TrashGroupDto {
  key: string;
  singular: string;
  plural: string;
  entries: TrashEntryDto[];
}

/** A located row: which entity it belongs to, its UID and what it says. */
interface Located {
  entity: TrashEntity;
  uid: string;
  row: Row;
  entry: TrashEntry;
}

const describe = (entity: TrashEntity, row: Row): TrashEntry => ({
  uid: String(row.uid),
  deletedAt: row.deletedAt === null || row.deletedAt === undefined ? null : String(row.deletedAt),
  ...entity.describe(row),
});

/** The deletion batch a row belongs to, or null for a row deleted before Slice 39. */
const batchOf = (located: Located): string | null =>
  located.row.batch === null || located.row.batch === undefined ? null : String(located.row.batch);

const locate = (entity: TrashEntity, row: Row): Located => ({
  entity,
  uid: String(row.uid),
  row,
  entry: describe(entity, row),
});

/** One deleted row of an entity, or null. */
async function loadOne(db: Queryable, entity: TrashEntity, uid: string): Promise<Located | null> {
  const rows = await db.query<Row[]>(
    `${entity.listSql} AND ${entity.alias}.${entity.table.uidColumn} = ? LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  return row === undefined ? null : locate(entity, row);
}

/** Every deleted row of an entity, newest deletion first (undated ones last). */
async function loadAll(db: Queryable, entity: TrashEntity): Promise<Located[]> {
  const rows = await db.query<Row[]>(
    `${entity.listSql} ORDER BY ${entity.alias}.deletedAt DESC, uid`,
  );
  return rows.map((row) => locate(entity, row));
}

/**
 * The deleted records that hang directly on this one. With `batch` given, only
 * those deleted in the same moment — which is what a cascade leaves behind and
 * therefore exactly what a restore reverses.
 */
async function deletedChildren(
  db: Queryable,
  parent: Located,
  batch?: string | null,
): Promise<Located[]> {
  const links = await linksTo(db, parent.entity.table.table, parent.entity.table.uidColumn);
  const children: Located[] = [];
  for (const link of links) {
    const entity = entityOfTable(link.table);
    if (!entity) continue;
    const sameBatch = batch === undefined ? '' : ` AND ${BATCH_OF(entity.alias)} = ?`;
    const params = batch === undefined ? [parent.uid] : [parent.uid, batch];
    const rows = await db.query<Row[]>(
      `${entity.listSql} AND ${entity.alias}.${link.column} = ?${sameBatch}`,
      params,
    );
    children.push(...rows.map((row) => locate(entity, row)));
  }
  return children;
}

/**
 * All deleted records below this one, children before parents. `batch` narrows
 * it to one deletion moment (see `deletedChildren`). The `seen` set keeps the
 * self-reference of `Accounts.leadAccountUID` from turning into a loop.
 */
async function deletedDescendants(
  db: Queryable,
  parent: Located,
  batch?: string | null,
  seen = new Set<string>([`${parent.entity.table.table}:${parent.uid}`]),
): Promise<Located[]> {
  const found: Located[] = [];
  for (const child of await deletedChildren(db, parent, batch)) {
    const marker = `${child.entity.table.table}:${child.uid}`;
    if (seen.has(marker)) continue;
    seen.add(marker);
    found.push(...(await deletedDescendants(db, child, batch, seen)), child);
  }
  return found;
}

/** Attached rows of link tables (no records of their own) hanging on a record. */
async function attachedRows(db: Queryable, located: Located): Promise<Counted[]> {
  const links = await linksTo(db, located.entity.table.table, located.entity.table.uidColumn);
  const counts: Counted[] = [];
  for (const link of links) {
    if (entityOfTable(link.table)) continue;
    const names = ATTACHED_ROW_NAMES[link.table];
    if (!names) continue;
    const rows = await db.query<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM ${link.table} WHERE ${link.column} = ?`,
      [located.uid],
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) counts.push(counted(names, n));
  }
  return counts;
}

/**
 * What still ACTIVELY points at this record (or at one of the deleted records
 * below it) and therefore stops it from being removed for good. Counted per
 * kind, so the sentence reads "2 Rechnungen, 1 Police".
 */
async function blockers(db: Queryable, located: Located): Promise<Counted[]> {
  const tally = new Map<string, { entity: TrashEntity; count: number }>();
  const walk = async (current: Located, seen: Set<string>): Promise<void> => {
    const links = await linksTo(db, current.entity.table.table, current.entity.table.uidColumn);
    for (const link of links) {
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
    for (const child of await deletedChildren(db, current)) {
      const marker = `${child.entity.table.table}:${child.uid}`;
      if (seen.has(marker)) continue;
      seen.add(marker);
      await walk(child, seen);
    }
  };
  await walk(located, new Set([`${located.entity.table.table}:${located.uid}`]));
  return [...tally.values()].map(({ entity, count }) =>
    counted({ one: entity.singular, many: entity.plural }, count),
  );
}

/** The whole trash, grouped by kind in the registry's order; empty groups fall away. */
async function listTrash(db: Queryable): Promise<TrashGroupDto[]> {
  const groups: TrashGroupDto[] = [];
  for (const entity of TRASH_ENTITIES) {
    const located = await loadAll(db, entity);
    if (located.length === 0) continue;
    const entries: TrashEntryDto[] = [];
    for (const one of located) {
      const attached = await deletedDescendants(db, one);
      const batch = await deletedDescendants(db, one, batchOf(one));
      entries.push({
        ...one.entry,
        restorable: entity.restoreNote === undefined,
        restoreNote: entity.restoreNote ?? null,
        // Both German forms travel with the child, so the view never has to
        // invent a plural ("Policeen").
        attached: attached.map((child) => ({
          singular: child.entity.singular,
          plural: child.entity.plural,
          label: child.entry.label,
        })),
        attachedRows: await attachedRows(db, one),
        restoresWith: batch.length,
      });
    }
    groups.push({
      key: entity.key,
      singular: entity.singular,
      plural: entity.plural,
      entries,
    });
  }
  return groups;
}

/** Adds the record a failure hung on to an error's details, and keeps its code. */
function blame(error: unknown, located: Located): unknown {
  const entry = { singular: located.entity.singular, label: located.entry.label };
  if (error instanceof ApiError) {
    return new ApiError(error.httpStatus, error.code, error.message, {
      ...error.details,
      entry,
    });
  }
  // A unique violation no check caught first — never let the driver's error out.
  if (typeof error === 'object' && error !== null && (error as { errno?: number }).errno === 1062) {
    return conflict('Restoring the record would duplicate a unique value', {
      code: ERROR_CODES.RESTORE_CONFLICT,
      details: { entry },
    });
  }
  return error;
}

/**
 * Refuses the restore while a record the row cannot exist without is itself in
 * the trash. Only NOT NULL references count: an optional one (an invoice's
 * facility) pointing at a deleted record is a state the app already lives with.
 */
async function assertAncestorsPresent(db: Queryable, located: Located): Promise<void> {
  for (const link of await linksFrom(db, located.entity.table.table)) {
    if (link.nullable) continue;
    const parent = entityOfTable(link.referencedTable);
    if (!parent) continue;
    const value = located.row[link.column];
    if (value === null || value === undefined) continue;
    const deleted = await loadOne(db, parent, String(value));
    if (deleted) {
      throw conflict(`The ${parent.singular} of this record is in the trash as well`, {
        code: ERROR_CODES.PARENT_IN_TRASH,
        details: {
          entry: { singular: located.entity.singular, label: located.entry.label },
          parent: { singular: parent.singular, label: deleted.entry.label },
        },
      });
    }
  }
}

/** Brings one row back, after everything that must hold for it has been checked. */
async function restoreOne(db: Queryable, located: Located): Promise<void> {
  try {
    await assertAncestorsPresent(db, located);
    await located.entity.assertRestorable?.(db, located.row);
    await restoreRow(db, located.entity.table, located.uid);
  } catch (error) {
    throw blame(error, located);
  }
}

/**
 * The record and the rows deleted in the same batch with it, in one
 * transaction: parents before children, so an ancestor is already back when its
 * child is checked. Returns how many rows came back.
 */
async function restoreEntry(pool: Pool, located: Located): Promise<number> {
  if (located.entity.restoreNote !== undefined) {
    throw conflict('This kind of record cannot be restored', {
      code: ERROR_CODES.NOT_RESTORABLE,
      details: {
        entry: { singular: located.entity.singular, label: located.entry.label },
        reason: located.entity.restoreNote,
      },
    });
  }
  return withTransaction(pool, async (conn) => {
    const batch = await deletedDescendants(conn, located, batchOf(located));
    await restoreOne(conn, located);
    // `deletedDescendants` hands back children before parents; a restore needs
    // the other order, so an ancestor is active before its child is checked.
    for (const child of [...batch].reverse()) await restoreOne(conn, child);
    return batch.length + 1;
  });
}

/**
 * Removes the record for good, together with the deleted records below it and
 * the link rows that belong to it. Refuses while something active points at it.
 */
async function purgeEntry(pool: Pool, located: Located): Promise<void> {
  const stopping = await blockers(pool, located);
  if (stopping.length > 0) {
    throw conflict('The record is still referenced by active records', {
      code: ERROR_CODES.STILL_REFERENCED,
      details: {
        entry: { singular: located.entity.singular, label: located.entry.label },
        blockers: stopping,
      },
    });
  }

  await withTransaction(pool, async (conn) => {
    const below = await deletedDescendants(conn, located);
    // Children first, the record last — the foreign keys are all RESTRICT.
    for (const one of [...below, located]) {
      for (const link of await linksTo(conn, one.entity.table.table, one.entity.table.uidColumn)) {
        if (entityOfTable(link.table)) continue;
        // A link is not a record of its own (migration 007): it goes with the
        // row it links. What the database cascades itself is left to it.
        if (link.deleteRule === 'RESTRICT' || link.deleteRule === 'NO ACTION') {
          await conn.query(`DELETE FROM ${link.table} WHERE ${link.column} = ?`, [one.uid]);
        }
      }
      await hardDeleteRow(conn, one.entity.table, one.uid);
    }
    // A submission that just lost its last invoice is an empty shell no view
    // can show, so it follows its invoices into the trash — the same rule as
    // withdrawing the last invoice by hand (see submissions.ts).
    await softDeleteEmptySubmissions(conn);
  });
}

/** Soft-deletes every active submission left without invoices. */
async function softDeleteEmptySubmissions(db: Queryable): Promise<void> {
  const rows = await db.query<Array<{ submissionUID: string }>>(
    `SELECT s.submissionUID FROM Submissions s
      WHERE s.submissionStatus <> -1
        AND NOT EXISTS (SELECT 1 FROM SubmissionInvoices si
                         WHERE si.submissionUID = s.submissionUID)`,
  );
  const entity = TRASH_ENTITIES.find((one) => one.key === 'submission');
  if (!entity) return;
  for (const row of rows) await softDeleteRow(db, entity.table, row.submissionUID);
}

/** The deleted record behind a UID, or a 404 — the entity comes from its prefix. */
async function locateOr404(pool: Pool, uid: string): Promise<Located> {
  const entity = entityOfUid(uid);
  if (!entity) throw notFound('Deleted record');
  const located = await loadOne(pool, entity, uid);
  if (!located) throw notFound('Deleted record');
  return located;
}

/**
 * The trash API. Everything behind `MANAGE_TRASH` held globally: the permission
 * check gets no account UID, so only a global grant satisfies it.
 */
export function createTrashRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireTrash = createRequirePermission(pool, PERMISSIONS.MANAGE_TRASH);

  router.get('/', requireAuth, requireTrash, async (_req, res) => {
    sendData(res, { groups: await listTrash(pool) });
  });

  router.post('/:uid/restore', requireAuth, requireTrash, async (req, res) => {
    const located = await locateOr404(pool, pathParam(req, 'uid'));
    sendData(res, { restored: await restoreEntry(pool, located) });
  });

  router.delete('/:uid', requireAuth, requireTrash, async (req, res) => {
    const located = await locateOr404(pool, pathParam(req, 'uid'));
    await purgeEntry(pool, located);
    res.status(204).end();
  });

  return router;
}
