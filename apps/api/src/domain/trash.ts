import { ERROR_CODES, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, createRequirePermission, getAuthUser } from '../auth/middleware.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type Queryable, hardDeleteRow, restoreRow, softDeleteRow } from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError, conflict, notFound } from '../lib/api-error.js';
import { auditTrashPurged, auditTrashRestored } from '../lib/audit.js';
import { isSqlError } from '../lib/error-handler.js';
import { linksFrom, linksTo } from './trash-references.js';
import { type TrashEntry, TRASH_ENTITIES, entityOfTable, entityOfUid } from './trash-registry.js';
import {
  type Counted,
  type Located,
  attachedCounts,
  batchOf,
  blockers,
  childEdges,
  deletedDescendants,
  descendantsOf,
  loadAll,
  loadOne,
} from './trash-tree.js';

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
 * Not account-scoped, and that is a rule rather than a gap: `MANAGE_TRASH` is an
 * instance-wide permission like `MANAGE_USERS` (see Notes/eunomia-plan.md 2.4,
 * and SEC-04 of the security review, which names this the one exception to
 * invariant I-2). A deleted record's own account link may be deleted too, so
 * there would be nothing left to scope by — and four of the entities below have
 * no account at all. The permission therefore belongs to administrators only.
 */

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

/** The whole trash, grouped by kind in the registry's order; empty groups fall away. */
async function listTrash(db: Queryable): Promise<TrashGroupDto[]> {
  const groups: TrashGroupDto[] = [];
  for (const entity of TRASH_ENTITIES) {
    const located = await loadAll(db, entity);
    if (located.length === 0) continue;
    // Asked once for the whole kind, then read per entry (CR-17).
    const edges = await childEdges(db, located);
    const counts = await attachedCounts(db, entity, located);
    const entries: TrashEntryDto[] = [];
    for (const one of located) {
      const attached = descendantsOf(one, edges);
      const batch = descendantsOf(one, edges, batchOf(one));
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
        attachedRows: counts.get(one.uid) ?? [],
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
  if (isSqlError(error) && error.errno === 1062) {
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
 * Answers how many further records went with it, for the audit line.
 */
async function purgeEntry(pool: Pool, located: Located): Promise<number> {
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

  return withTransaction(pool, async (conn) => {
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
    return below.length;
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

  // Both lines name the kind and the UID and never the label: a trash entry's
  // label is an invoice number and the treated person's name (SEC-09, I-7).
  router.post('/:uid/restore', requireAuth, requireTrash, async (req, res) => {
    const located = await locateOr404(pool, pathParam(req, 'uid'));
    const restored = await restoreEntry(pool, located);
    auditTrashRestored({
      actor: getAuthUser(res).uuidText,
      kind: located.entity.key,
      uid: located.uid,
      // The record itself is part of the count; what came with it is the rest.
      alsoRestored: restored - 1,
    });
    sendData(res, { restored });
  });

  router.delete('/:uid', requireAuth, requireTrash, async (req, res) => {
    const located = await locateOr404(pool, pathParam(req, 'uid'));
    const alsoRemoved = await purgeEntry(pool, located);
    auditTrashPurged({
      actor: getAuthUser(res).uuidText,
      kind: located.entity.key,
      uid: located.uid,
      alsoRemoved,
    });
    res.status(204).end();
  });

  return router;
}
