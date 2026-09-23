import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type CrudTable, type Row, getRow, insertRow, softDeleteRow } from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { authorizeAccount } from './workflow-access.js';

const table: CrudTable = {
  table: 'Allocations',
  uidColumn: 'allocationUID',
  statusColumn: 'allocationStatus',
  entity: 'allocation',
  columns: ['invoiceUID', 'billingUID', 'receiptNumber', 'reimbursement'],
};

/**
 * One reimbursement to book. Several of them are created in one request, so a
 * Leistungsabrechnung that answers a submission of five invoices is entered in
 * a single step (see createAllocationsForBilling).
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
    .refine(
      (entries) => new Set(entries.map((e) => e.invoiceUID)).size === entries.length,
      'entries must not repeat an invoice',
    ),
});

type AllocationEntry = z.infer<typeof allocationEntriesSchema>['entries'][number];

interface CandidateInvoice {
  invoiceUID: string;
  invoiceNumber: string;
  invoiceAmount: number;
  /** Whether the invoice is part of the billing's submission. */
  inSubmission: number;
  /** What this invoice was already reimbursed, over every policy. */
  allocated: number;
}

/**
 * Validates every requested reimbursement against the billing's submission.
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
    .filter((e) => !Number(byUid.get(e.invoiceUID)?.inSubmission))
    .map((e) => byUid.get(e.invoiceUID)?.invoiceNumber);
  if (foreign.length > 0) {
    throw badRequest(
      `Invoices do not belong to the service billing's submission: ${foreign.join(', ')}`,
      { code: ERROR_CODES.INVOICES_NOT_IN_SUBMISSION, details: { invoices: foreign } },
    );
  }
  // No enrichment ("Bereicherungsverbot"): all reimbursements of an invoice,
  // over every policy, together never exceed its amount.
  const exceeding = entries
    .filter((entry) => {
      const candidate = byUid.get(entry.invoiceUID) as CandidateInvoice;
      const totalCents =
        Math.round(Number(candidate.allocated) * 100) + Math.round(entry.reimbursement * 100);
      return totalCents > Math.round(Number(candidate.invoiceAmount) * 100);
    })
    .map((e) => byUid.get(e.invoiceUID)?.invoiceNumber);
  if (exceeding.length > 0) {
    throw conflict(`The reimbursements would exceed the invoice amount: ${exceeding.join(', ')}`, {
      code: ERROR_CODES.REIMBURSEMENT_EXCEEDS_INVOICE,
      details: { invoices: exceeding },
    });
  }
}

/**
 * Books the reimbursements of one service billing onto its submission's
 * invoices, all or nothing. The invoices are locked first so concurrent
 * bookings (and amount edits) are checked against the same totals.
 */
export async function createAllocationsForBilling(
  pool: Pool,
  userId: number,
  billingUID: string,
  entries: AllocationEntry[],
): Promise<Row[]> {
  const [billing] = await pool.query<Array<{ submissionUID: string; accountUID: string }>>(
    `SELECT b.submissionUID, c.accountUID
       FROM ServiceBillings b
       JOIN Submissions s ON s.submissionUID = b.submissionUID
       JOIN Contracts c ON c.contractUID = s.contractUID
      WHERE b.billingUID = ? AND b.billingStatus <> -1
      LIMIT 1`,
    [billingUID],
  );
  if (!billing) throw notFound('Service billing');

  await authorizeAccount(pool, userId, PERMISSIONS.MANAGE_INVOICES, billing.accountUID);

  return withTransaction(pool, async (conn) => {
    const invoiceUIDs = entries.map((e) => e.invoiceUID);
    const placeholders = invoiceUIDs.map(() => '?').join(', ');
    await conn.query(
      `SELECT invoiceUID FROM Invoices WHERE invoiceUID IN (${placeholders}) FOR UPDATE`,
      invoiceUIDs,
    );
    const candidates = await conn.query<CandidateInvoice[]>(
      `SELECT i.invoiceUID, i.invoiceNumber, i.invoiceAmount,
              EXISTS (
                SELECT 1 FROM SubmissionInvoices si
                 WHERE si.submissionUID = ? AND si.invoiceUID = i.invoiceUID
              ) AS inSubmission,
              COALESCE((
                SELECT SUM(a.reimbursement) FROM Allocations a
                 WHERE a.invoiceUID = i.invoiceUID AND a.allocationStatus <> -1
              ), 0) AS allocated
         FROM Invoices i
        WHERE i.invoiceUID IN (${placeholders}) AND i.invoiceStatus <> -1`,
      [billing.submissionUID, ...invoiceUIDs],
    );
    assertEntriesBookable(candidates, entries);

    const created: Row[] = [];
    for (const entry of entries) {
      created.push(await insertRow(conn, table, { ...entry, billingUID }));
    }
    return created;
  });
}

/** Router for allocations: mapping a service billing's reimbursement to an invoice. */
export function createAllocationsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const where = ['a.allocationStatus <> -1'];
    const params: unknown[] = [];

    for (const [key, column] of [
      ['invoiceUID', 'a.invoiceUID'],
      ['billingUID', 'a.billingUID'],
    ] as const) {
      const value = req.query[key];
      if (typeof value === 'string') {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }

    const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_INVOICES);
    if (!scope.all) {
      if (scope.accountUIDs.length === 0) {
        sendData(res, []);
        return;
      }
      where.push(`i.accountUID IN (${scope.accountUIDs.map(() => '?').join(', ')})`);
      params.push(...scope.accountUIDs);
    }

    const rows = await pool.query(
      `SELECT a.allocationUID, a.invoiceUID, a.billingUID, a.receiptNumber, a.reimbursement, a.allocationStatus
         FROM Allocations a
         JOIN Invoices i ON i.invoiceUID = a.invoiceUID
        WHERE ${where.join(' AND ')}
        ORDER BY a.allocationUID`,
      params,
    );
    sendData(res, rows);
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForAllocation(pool, uid);
    if (account === null) throw notFound('Allocation');
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, account);
    sendData(res, await getRow(pool, table, uid));
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForAllocation(pool, uid);
    if (account === null) throw notFound('Allocation');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    await softDeleteRow(pool, table, uid);
    res.status(204).end();
  });

  return router;
}

/** The owning account of an allocation, via its invoice. */
async function accountForAllocation(pool: Pool, allocationUID: string): Promise<string | null> {
  const rows = await pool.query<Array<{ accountUID: string }>>(
    `SELECT i.accountUID
       FROM Allocations a
       JOIN Invoices i ON i.invoiceUID = a.invoiceUID
      WHERE a.allocationUID = ? AND a.allocationStatus <> -1
      LIMIT 1`,
    [allocationUID],
  );
  return rows[0]?.accountUID ?? null;
}
