import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import type { CrudTable } from '../crud/repository.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { withTransaction } from '../db/transaction.js';
import { ENTITY_PREFIX, entityIdPattern, generateEntityId } from '../lib/ids.js';
import { requireContractAccount, requireSubmissionAccount } from './workflow-access.js';

/**
 * A submission is written by hand here (its invoices come with it, in one
 * transaction), so the generic CRUD helpers are not used for it — but the
 * trash needs its table spec like every other entity's, so it lives here
 * rather than in the registry.
 */
export const submissionsTable: CrudTable = {
  table: 'Submissions',
  uidColumn: 'submissionUID',
  statusColumn: 'submissionStatus',
  entity: 'submission',
  columns: ['contractUID', 'submittedDate', 'documentLink'],
};

const createSchema = z.object({
  contractUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.contract)),
  submittedDate: z.string().date(),
  // The invoices bundled into this submission — at least one, no duplicates.
  invoiceUIDs: z
    .array(z.string().regex(entityIdPattern(ENTITY_PREFIX.invoice)))
    .min(1)
    .refine((uids) => new Set(uids).size === uids.length, 'invoiceUIDs must be unique'),
});

interface CandidateInvoice {
  invoiceUID: string;
  invoiceNumber: string;
  accountUID: string;
  reimbursementClosed: number;
  /** Marked as not covered by the insurance: it goes to no policy at all. */
  notCovered: number;
  /** Whether the invoice is already submitted to the requested contract. */
  alreadySubmitted: number;
  /** Whether the invoice is marked as not reimbursable under the requested contract. */
  excluded: number;
}

/**
 * Validates that every requested invoice can join a submission to this
 * contract: it must exist and be active, belong to the contract's account,
 * not be marked as not covered by the insurance at all, not already be
 * submitted to this contract (other contracts are fine), not be marked as
 * excluded for it, and not be closed as billed. Rejects with a
 * descriptive 400/409 otherwise. Runs inside the caller's transaction with row
 * locks (FOR UPDATE) so two concurrent submissions cannot both grab the same
 * invoice; UNIQUE (invoiceUID, contractUID) on SubmissionInvoices is the
 * structural backstop.
 */
function assertInvoicesSubmittable(
  candidates: CandidateInvoice[],
  requested: string[],
  contractAccount: string,
): void {
  const byUid = new Map(candidates.map((c) => [c.invoiceUID, c]));
  // Failing invoices are named by their number — that is what the user sees in
  // the list, and what the UI puts into its message (see lib/error-codes.ts).
  const failing = (predicate: (c: CandidateInvoice) => boolean): string[] =>
    requested
      .map((uid) => byUid.get(uid) as CandidateInvoice)
      .filter(predicate)
      .map((c) => c.invoiceNumber);

  const unknown = requested.filter((uid) => !byUid.has(uid));
  if (unknown.length > 0) {
    throw badRequest(`Unknown or inactive invoices: ${unknown.join(', ')}`, {
      code: ERROR_CODES.INVOICES_UNKNOWN,
      details: { invoices: unknown },
    });
  }
  const wrongAccount = failing((c) => c.accountUID !== contractAccount);
  if (wrongAccount.length > 0) {
    throw badRequest(
      `Invoices do not belong to the contract's account: ${wrongAccount.join(', ')}`,
      { code: ERROR_CODES.INVOICES_WRONG_ACCOUNT, details: { invoices: wrongAccount } },
    );
  }
  // A property of the invoice, not of the pair, so it comes before the checks
  // that look at this one policy (Slice 42).
  const notCovered = failing((c) => Number(c.notCovered) > 0);
  if (notCovered.length > 0) {
    throw conflict(`Invoices are marked as not covered: ${notCovered.join(', ')}`, {
      code: ERROR_CODES.INVOICES_NOT_COVERED,
      details: { invoices: notCovered },
    });
  }
  const alreadySubmitted = failing((c) => Number(c.alreadySubmitted) > 0);
  if (alreadySubmitted.length > 0) {
    throw conflict(
      `Invoices are already submitted to this contract: ${alreadySubmitted.join(', ')}`,
      { code: ERROR_CODES.INVOICES_ALREADY_SUBMITTED, details: { invoices: alreadySubmitted } },
    );
  }
  const excluded = failing((c) => Number(c.excluded) > 0);
  if (excluded.length > 0) {
    throw conflict(
      `Invoices are marked as not reimbursable under this contract: ${excluded.join(', ')}`,
      { code: ERROR_CODES.INVOICES_EXCLUDED, details: { invoices: excluded } },
    );
  }
  const closed = failing((c) => Boolean(c.reimbursementClosed));
  if (closed.length > 0) {
    throw conflict(`Invoices are already marked as billed: ${closed.join(', ')}`, {
      code: ERROR_CODES.INVOICES_ALREADY_BILLED,
      details: { invoices: closed },
    });
  }
}

/** Router for submissions (Einreichungen): transactional batch submit + read. */
export function createSubmissionsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const input = createSchema.parse(req.body);

    const contractAccount = await requireContractAccount(
      pool,
      user.userId,
      PERMISSIONS.MANAGE_INVOICES,
      input.contractUID,
    );

    const submissionUID = await withTransaction(pool, async (conn) => {
      const placeholders = input.invoiceUIDs.map(() => '?').join(', ');
      await conn.query(
        `SELECT invoiceUID FROM Invoices WHERE invoiceUID IN (${placeholders}) FOR UPDATE`,
        input.invoiceUIDs,
      );
      const candidates = await conn.query<CandidateInvoice[]>(
        `SELECT i.invoiceUID, i.invoiceNumber, i.accountUID, i.reimbursementClosed, i.notCovered,
                EXISTS (
                  SELECT 1 FROM SubmissionInvoices si
                    JOIN Submissions s
                      ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
                   WHERE si.invoiceUID = i.invoiceUID AND si.contractUID = ?
                ) AS alreadySubmitted,
                EXISTS (
                  SELECT 1 FROM InvoiceExclusions x
                   WHERE x.invoiceUID = i.invoiceUID AND x.contractUID = ?
                ) AS excluded
           FROM Invoices i
          WHERE i.invoiceUID IN (${placeholders}) AND i.invoiceStatus <> -1`,
        [input.contractUID, input.contractUID, ...input.invoiceUIDs],
      );
      assertInvoicesSubmittable(candidates, input.invoiceUIDs, contractAccount);

      const uid = generateEntityId('submission');
      await conn.query(
        'INSERT INTO Submissions (submissionUID, contractUID, submittedDate) VALUES (?, ?, ?)',
        [uid, input.contractUID, input.submittedDate],
      );
      await conn.batch(
        'INSERT INTO SubmissionInvoices (submissionUID, invoiceUID, contractUID) VALUES (?, ?, ?)',
        input.invoiceUIDs.map((invoiceUID) => [uid, invoiceUID, input.contractUID]),
      );
      return uid;
    });

    sendData(
      res,
      {
        submissionUID,
        contractUID: input.contractUID,
        submittedDate: input.submittedDate,
        accountUID: contractAccount,
        invoiceUIDs: input.invoiceUIDs,
      },
      201,
    );
  });

  router.get('/', requireAuth, async (_req, res) => {
    const user = getAuthUser(res);
    const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_INVOICES);
    const where = ['s.submissionStatus <> -1'];
    const params: unknown[] = [];
    if (!scope.all) {
      if (scope.accountUIDs.length === 0) {
        sendData(res, []);
        return;
      }
      where.push(`c.accountUID IN (${scope.accountUIDs.map(() => '?').join(', ')})`);
      params.push(...scope.accountUIDs);
    }
    const rows = await pool.query<Array<{ submissionUID: string }>>(
      `SELECT s.submissionUID, s.contractUID, s.submittedDate,
              s.submissionStatus, c.accountUID
         FROM Submissions s
         JOIN Contracts c ON c.contractUID = s.contractUID
        WHERE ${where.join(' AND ')}
        ORDER BY s.submittedDate DESC, s.submissionUID`,
      params,
    );

    // The invoice IDs come as their own query rather than a GROUP_CONCAT: that
    // function truncates at group_concat_max_len (1 KB by default, about 78 IDs)
    // without saying so, and a submission that lost half its invoices on the way
    // out would look like a correct answer. The detail route reads them the same
    // way.
    const invoiceUIDs = new Map(rows.map((row) => [row.submissionUID, [] as string[]]));
    if (rows.length > 0) {
      const uids = rows.map((row) => row.submissionUID);
      const links = await pool.query<Array<{ submissionUID: string; invoiceUID: string }>>(
        `SELECT submissionUID, invoiceUID
           FROM SubmissionInvoices
          WHERE submissionUID IN (${uids.map(() => '?').join(', ')})
          ORDER BY invoiceUID`,
        uids,
      );
      for (const link of links) invoiceUIDs.get(link.submissionUID)?.push(link.invoiceUID);
    }

    sendData(
      res,
      rows.map((row) => ({ ...row, invoiceUIDs: invoiceUIDs.get(row.submissionUID) ?? [] })),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await requireSubmissionAccount(
      pool,
      user.userId,
      PERMISSIONS.VIEW_INVOICES,
      uid,
    );

    const [submission] = await pool.query(
      `SELECT submissionUID, contractUID, submittedDate, submissionStatus
         FROM Submissions WHERE submissionUID = ? LIMIT 1`,
      [uid],
    );
    const invoices = await pool.query<Array<{ invoiceUID: string }>>(
      'SELECT invoiceUID FROM SubmissionInvoices WHERE submissionUID = ? ORDER BY invoiceUID',
      [uid],
    );
    // A billing hangs on the policy now, so the ones "of this submission" are
    // those that booked a reimbursement on one of its invoices.
    const billings = await pool.query<Array<{ billingUID: string }>>(
      `SELECT DISTINCT b.billingUID
         FROM SubmissionInvoices si
         JOIN Allocations a ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
         JOIN ServiceBillings b
           ON b.billingUID = a.billingUID AND b.billingStatus <> -1
          AND b.contractUID = si.contractUID
        WHERE si.submissionUID = ?
        ORDER BY b.billingUID`,
      [uid],
    );
    sendData(res, {
      ...submission,
      accountUID: account,
      invoiceUIDs: invoices.map((row) => row.invoiceUID),
      billingUIDs: billings.map((row) => row.billingUID),
    });
  });

  // Withdraws an invoice from a submission (e.g. submitted to the wrong
  // policy). Only while the insurer has not answered *this invoice*: a booked
  // reimbursement at this policy is history and stays. The rule is per invoice
  // since Slice 37 — a billing spans submissions, so "the submission has a
  // billing" would needlessly lock invoices nobody has answered yet. A
  // submission left without invoices is deleted with it; an invoice left
  // without any submission loses its "billed" mark, which only applies to
  // submitted invoices.
  router.delete('/:uid/invoices/:invoiceUID', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const invoiceUID = pathParam(req, 'invoiceUID');
    await requireSubmissionAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);

    await withTransaction(pool, async (conn) => {
      await conn.query('SELECT submissionUID FROM Submissions WHERE submissionUID = ? FOR UPDATE', [
        uid,
      ]);
      const [booked] = await conn.query<Array<{ n: number }>>(
        `SELECT COUNT(*) AS n
           FROM SubmissionInvoices si
           JOIN Allocations a ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
           JOIN ServiceBillings b
             ON b.billingUID = a.billingUID AND b.billingStatus <> -1
            AND b.contractUID = si.contractUID
          WHERE si.submissionUID = ? AND si.invoiceUID = ?`,
        [uid, invoiceUID],
      );
      if (Number(booked?.n ?? 0) > 0) {
        throw conflict('An invoice already reimbursed under this policy cannot be withdrawn', {
          code: ERROR_CODES.INVOICE_HAS_REIMBURSEMENT,
        });
      }
      const removed = (await conn.query(
        'DELETE FROM SubmissionInvoices WHERE submissionUID = ? AND invoiceUID = ?',
        [uid, invoiceUID],
      )) as { affectedRows: number };
      if (removed.affectedRows === 0) throw notFound('Invoice in submission');

      const [left] = await conn.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM SubmissionInvoices WHERE submissionUID = ?',
        [uid],
      );
      if (Number(left?.n ?? 0) === 0) {
        await conn.query(
          'UPDATE Submissions SET submissionStatus = -1, deletedAt = NOW(6) WHERE submissionUID = ?',
          [uid],
        );
      }
      await conn.query(
        `UPDATE Invoices i SET i.reimbursementClosed = 0
          WHERE i.invoiceUID = ?
            AND NOT EXISTS (
              SELECT 1 FROM SubmissionInvoices si
                JOIN Submissions s
                  ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
               WHERE si.invoiceUID = i.invoiceUID
            )`,
        [invoiceUID],
      );
    });
    res.status(204).end();
  });

  return router;
}
