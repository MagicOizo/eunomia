import { ERROR_CODES, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { accountFilter } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { parseQuery, pathParam } from '../crud/params.js';
import {
  crudTable,
  type Queryable,
  type Row,
  getRow,
  insertManyRows,
  placeholders,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { authorizeAccount, requireAllocationAccount } from './workflow-access.js';

export const allocationsTable = crudTable({
  table: 'Allocations',
  uidColumn: 'allocationUID',
  statusColumn: 'allocationStatus',
  entity: 'allocation',
  columns: ['invoiceUID', 'billingUID', 'receiptNumber', 'reimbursement'],
});

/**
 * One reimbursement to book. Several of them are created in one request, so a
 * Leistungsabrechnung that answers five invoices is entered in a single step
 * (see createAllocationsForBilling).
 */
export const allocationEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        invoiceUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.invoice)),
        receiptNumber: z.string().trim().min(1).max(50).nullish(),
        reimbursement: z.number().min(0).max(99999999.99),
      }),
    )
    .min(1)
    // One letter of the insurer answers a handful of invoices, not a thousand.
    // The bound matters because every entry is its own INSERT in ONE
    // transaction, with every invoice it touches locked FOR UPDATE (SEC-11).
    .max(200)
    .refine(
      (entries) => new Set(entries.map((e) => e.invoiceUID)).size === entries.length,
      'entries must not repeat an invoice',
    ),
});

type AllocationEntry = z.infer<typeof allocationEntriesSchema>['entries'][number];

/**
 * What may be corrected on a booked reimbursement. Which invoice and which
 * billing it belongs to is not in here on purpose: a booking is corrected,
 * not moved — moving it stays deleting and booking anew.
 */
export const allocationPatchSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(50).nullish(),
  reimbursement: z.number().min(0).max(99999999.99).optional(),
});

interface CandidateInvoice {
  invoiceUID: string;
  invoiceNumber: string;
  invoiceAmount: number;
  /** Whether the invoice was submitted to the billing's policy at all. */
  submittedHere: number;
  /** What this invoice was already reimbursed, over every policy. */
  allocated: number;
}

/**
 * The invoices a booking may touch, with what they carry already: whether they
 * are submitted at the billing's policy, and the sum of their reimbursements
 * over every policy. `ignoreAllocationUID` leaves one booking out of that sum
 * — a booking that is being changed has to be measured against the others, not
 * against its own old amount.
 *
 * The policy, not the submission, is what decides: one letter of the insurer
 * regularly answers invoices submitted on different days (see Slice 37).
 *
 * **Account separation hangs on `submittedHere`** (SEC-17). This query is given
 * a `contractUID` and asks no permission of its own; what keeps a booking
 * inside the caller's accounts is that `assertEntriesBookable` rejects every
 * invoice without `submittedHere`, and that a submission was account-checked
 * when it was made (`assertInvoicesSubmittable` in submissions.ts). Loosening
 * that rule — accepting an invoice that is merely eligible, say — would open
 * cross-account access here without touching a single authorization call.
 */
async function loadCandidates(
  conn: Queryable,
  contractUID: string,
  invoiceUIDs: string[],
  ignoreAllocationUID?: string,
): Promise<CandidateInvoice[]> {
  const ignore = ignoreAllocationUID ? 'AND a.allocationUID <> ?' : '';
  return conn.query<CandidateInvoice[]>(
    `SELECT i.invoiceUID, i.invoiceNumber, i.invoiceAmount,
            EXISTS (
              SELECT 1 FROM SubmissionInvoices si
                JOIN Submissions s
                  ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
               WHERE si.contractUID = ? AND si.invoiceUID = i.invoiceUID
            ) AS submittedHere,
            COALESCE((
              SELECT SUM(a.reimbursement) FROM Allocations a
               WHERE a.invoiceUID = i.invoiceUID AND a.allocationStatus <> -1 ${ignore}
            ), 0) AS allocated
       FROM Invoices i
      WHERE i.invoiceUID IN (${placeholders(invoiceUIDs)}) AND i.invoiceStatus <> -1`,
    [contractUID, ...(ignoreAllocationUID ? [ignoreAllocationUID] : []), ...invoiceUIDs],
  );
}

/**
 * Validates every requested reimbursement against the billing's policy.
 * Like assertInvoicesSubmittable in submissions.ts, each rule reports all the
 * invoices that fail it, so a bulk entry does not have to be fixed one
 * rejection at a time. Invoices are named by their number where known — that
 * is what the user sees in the list.
 */
function assertEntriesBookable(candidates: CandidateInvoice[], entries: AllocationEntry[]): void {
  const byUid = new Map(candidates.map((c) => [c.invoiceUID, c]));

  const unknown = entries.filter((e) => !byUid.has(e.invoiceUID)).map((e) => e.invoiceUID);
  if (unknown.length > 0) {
    throw badRequest(`Unknown or inactive invoices: ${unknown.join(', ')}`, {
      code: ERROR_CODES.INVOICES_UNKNOWN,
      details: { invoices: unknown },
    });
  }
  const foreign = entries
    .filter((e) => !Number(byUid.get(e.invoiceUID)?.submittedHere))
    .map((e) => byUid.get(e.invoiceUID)?.invoiceNumber);
  if (foreign.length > 0) {
    throw badRequest(
      `Invoices are not submitted to the service billing's policy: ${foreign.join(', ')}`,
      { code: ERROR_CODES.INVOICES_NOT_SUBMITTED_HERE, details: { invoices: foreign } },
    );
  }
  // No enrichment ("Bereicherungsverbot"): all reimbursements of an invoice,
  // over every policy, together never exceed its amount.
  const exceeding = entries.flatMap((entry) => {
    // An entry without a candidate was rejected as unknown above; saying so
    // here rather than asserting it keeps one lookup instead of two.
    const candidate = byUid.get(entry.invoiceUID);
    if (candidate === undefined) return [];
    const totalCents =
      Math.round(Number(candidate.allocated) * 100) + Math.round(entry.reimbursement * 100);
    return totalCents > Math.round(Number(candidate.invoiceAmount) * 100)
      ? [candidate.invoiceNumber]
      : [];
  });
  if (exceeding.length > 0) {
    throw conflict(`The reimbursements would exceed the invoice amount: ${exceeding.join(', ')}`, {
      code: ERROR_CODES.REIMBURSEMENT_EXCEEDS_INVOICE,
      details: { invoices: exceeding },
    });
  }
}

/**
 * Books the reimbursements of one service billing onto invoices submitted at
 * its policy, all or nothing — they may come from several submissions. The
 * invoices are locked first so concurrent bookings (and amount edits) are
 * checked against the same totals.
 */
export async function createAllocationsForBilling(
  pool: Pool,
  userId: number,
  billingUID: string,
  entries: AllocationEntry[],
): Promise<Row[]> {
  const [billing] = await pool.query<Array<{ contractUID: string; accountUID: string }>>(
    `SELECT b.contractUID, c.accountUID
       FROM ServiceBillings b
       JOIN Contracts c ON c.contractUID = b.contractUID
      WHERE b.billingUID = ? AND b.billingStatus <> -1
      LIMIT 1`,
    [billingUID],
  );
  if (!billing) throw notFound('Service billing');

  await authorizeAccount(pool, userId, PERMISSIONS.MANAGE_INVOICES, billing.accountUID);

  return withTransaction(pool, async (conn) => {
    const invoiceUIDs = entries.map((e) => e.invoiceUID);
    await conn.query(
      `SELECT invoiceUID FROM Invoices WHERE invoiceUID IN (${placeholders(invoiceUIDs)}) FOR UPDATE`,
      invoiceUIDs,
    );
    const candidates = await loadCandidates(conn, billing.contractUID, invoiceUIDs);
    assertEntriesBookable(candidates, entries);

    return insertManyRows(
      conn,
      allocationsTable,
      entries.map((entry) => ({ ...entry, billingUID })),
    );
  });
}

/**
 * Corrects one booked reimbursement: its amount and its receipt number. The
 * rules of assertEntriesBookable keep applying — above all the
 * "Bereicherungsverbot" — with the invoice locked as it is when booking, and
 * this booking's own amount left out of the sum it is measured against, so it
 * does not block itself.
 */
export async function updateAllocation(
  pool: Pool,
  userId: number,
  allocationUID: string,
  patch: z.infer<typeof allocationPatchSchema>,
): Promise<Row | null> {
  const [allocation] = await pool.query<
    Array<{
      invoiceUID: string;
      reimbursement: number;
      contractUID: string;
      accountUID: string;
    }>
  >(
    `SELECT a.invoiceUID, a.reimbursement, b.contractUID, i.accountUID
       FROM Allocations a
       JOIN Invoices i ON i.invoiceUID = a.invoiceUID
       JOIN ServiceBillings b ON b.billingUID = a.billingUID
      WHERE a.allocationUID = ? AND a.allocationStatus <> -1
      LIMIT 1`,
    [allocationUID],
  );
  if (!allocation) throw notFound('Allocation');

  await authorizeAccount(pool, userId, PERMISSIONS.MANAGE_INVOICES, allocation.accountUID);

  return withTransaction(pool, async (conn) => {
    await conn.query('SELECT invoiceUID FROM Invoices WHERE invoiceUID = ? FOR UPDATE', [
      allocation.invoiceUID,
    ]);
    const candidates = await loadCandidates(
      conn,
      allocation.contractUID,
      [allocation.invoiceUID],
      allocationUID,
    );
    assertEntriesBookable(candidates, [
      {
        invoiceUID: allocation.invoiceUID,
        // A patch that leaves a field out keeps what is booked today.
        reimbursement: patch.reimbursement ?? Number(allocation.reimbursement),
        receiptNumber: patch.receiptNumber,
      },
    ]);
    return updateRow(conn, allocationsTable, allocationUID, patch);
  });
}

/**
 * Filters of the allocations list: the two sides a reimbursement hangs
 * between, plus the same optional `limit` the other lists take.
 */
const listQuery = z.object({
  invoiceUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.invoice)).optional(),
  billingUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.serviceBilling)).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Router for allocations: mapping a service billing's reimbursement to an invoice. */
export function createAllocationsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const filters = parseQuery(req, listQuery);
    const where = ['a.allocationStatus <> -1'];
    const params: unknown[] = [];

    for (const [value, column] of [
      [filters.invoiceUID, 'a.invoiceUID'],
      [filters.billingUID, 'a.billingUID'],
    ] as const) {
      if (value !== undefined) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }

    const accountScope = await accountFilter(
      pool,
      user.userId,
      PERMISSIONS.VIEW_INVOICES,
      'i.accountUID',
    );
    if (accountScope === null) {
      sendData(res, []);
      return;
    }
    where.push(accountScope.clause);
    params.push(...accountScope.params);

    const rows = await pool.query(
      `SELECT a.allocationUID, a.invoiceUID, a.billingUID, a.receiptNumber, a.reimbursement, a.allocationStatus
         FROM Allocations a
         JOIN Invoices i ON i.invoiceUID = a.invoiceUID
        WHERE ${where.join(' AND ')}
        ORDER BY a.allocationUID${filters.limit === undefined ? '' : ' LIMIT ?'}`,
      filters.limit === undefined ? params : [...params, filters.limit],
    );
    sendData(res, rows);
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireAllocationAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, uid);
    sendData(res, await getRow(pool, allocationsTable, uid));
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const patch = allocationPatchSchema.parse(req.body);
    sendData(res, await updateAllocation(pool, user.userId, uid, patch));
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireAllocationAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);
    await softDeleteRow(pool, allocationsTable, uid);
    res.status(204).end();
  });

  return router;
}
