import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { withTransaction } from '../db/transaction.js';
import { ENTITY_PREFIX, entityIdPattern, generateEntityId } from '../lib/ids.js';
import { accountForContract, accountForSubmission, authorizeAccount } from './workflow-access.js';

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
  accountUID: string;
  reimbursementClosed: number;
  /** Whether the invoice is already submitted to the requested contract. */
  alreadySubmitted: number;
  /** Whether the invoice is marked as not reimbursable under the requested contract. */
  excluded: number;
}

/**
 * Validates that every requested invoice can join a submission to this
 * contract: it must exist and be active, belong to the contract's account,
 * not already be submitted to this contract (other contracts are fine), not
 * be marked as excluded for it, and not be closed as billed. Rejects with a
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
  const failing = (predicate: (c: CandidateInvoice) => boolean): string[] =>
    requested.filter((uid) => predicate(byUid.get(uid) as CandidateInvoice));

  const unknown = requested.filter((uid) => !byUid.has(uid));
  if (unknown.length > 0) {
    throw badRequest(`Unknown or inactive invoices: ${unknown.join(', ')}`);
  }
  const wrongAccount = failing((c) => c.accountUID !== contractAccount);
  if (wrongAccount.length > 0) {
    throw badRequest(
      `Invoices do not belong to the contract's account: ${wrongAccount.join(', ')}`,
    );
  }
  const alreadySubmitted = failing((c) => Number(c.alreadySubmitted) > 0);
  if (alreadySubmitted.length > 0) {
    throw conflict(
      `Invoices are already submitted to this contract: ${alreadySubmitted.join(', ')}`,
    );
  }
  const excluded = failing((c) => Number(c.excluded) > 0);
  if (excluded.length > 0) {
    throw conflict(
      `Invoices are marked as not reimbursable under this contract: ${excluded.join(', ')}`,
    );
  }
  const closed = failing((c) => Boolean(c.reimbursementClosed));
  if (closed.length > 0) {
    throw conflict(`Invoices are already marked as billed: ${closed.join(', ')}`);
  }
}

/** Router for submissions (Einreichungen): transactional batch submit + read. */
export function createSubmissionsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const input = createSchema.parse(req.body);

    const contractAccount = await accountForContract(pool, input.contractUID);
    if (contractAccount === null) throw notFound('Contract');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, contractAccount);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const placeholders = input.invoiceUIDs.map(() => '?').join(', ');
      await conn.query(
        `SELECT invoiceUID FROM Invoices WHERE invoiceUID IN (${placeholders}) FOR UPDATE`,
        input.invoiceUIDs,
      );
      const candidates = await conn.query<CandidateInvoice[]>(
        `SELECT i.invoiceUID, i.accountUID, i.reimbursementClosed,
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

      const submissionUID = generateEntityId('submission');
      await conn.query(
        'INSERT INTO Submissions (submissionUID, contractUID, submittedDate) VALUES (?, ?, ?)',
        [submissionUID, input.contractUID, input.submittedDate],
      );
      await conn.batch(
        'INSERT INTO SubmissionInvoices (submissionUID, invoiceUID, contractUID) VALUES (?, ?, ?)',
        input.invoiceUIDs.map((invoiceUID) => [submissionUID, invoiceUID, input.contractUID]),
      );

      await conn.commit();
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
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
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
    const rows = await pool.query(
      `SELECT s.submissionUID, s.contractUID, s.submittedDate,
              s.submissionStatus, c.accountUID,
              GROUP_CONCAT(si.invoiceUID ORDER BY si.invoiceUID) AS invoiceUIDs
         FROM Submissions s
         JOIN Contracts c ON c.contractUID = s.contractUID
         LEFT JOIN SubmissionInvoices si ON si.submissionUID = s.submissionUID
        WHERE ${where.join(' AND ')}
        GROUP BY s.submissionID
        ORDER BY s.submittedDate DESC, s.submissionUID`,
      params,
    );
    sendData(
      res,
      rows.map((row: { invoiceUIDs: string | null }) => ({
        ...row,
        invoiceUIDs: row.invoiceUIDs === null ? [] : row.invoiceUIDs.split(','),
      })),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForSubmission(pool, uid);
    if (account === null) throw notFound('Submission');
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, account);

    const [submission] = await pool.query(
      `SELECT submissionUID, contractUID, submittedDate, submissionStatus
         FROM Submissions WHERE submissionUID = ? LIMIT 1`,
      [uid],
    );
    const invoices = await pool.query<Array<{ invoiceUID: string }>>(
      'SELECT invoiceUID FROM SubmissionInvoices WHERE submissionUID = ? ORDER BY invoiceUID',
      [uid],
    );
    const billings = await pool.query<Array<{ billingUID: string }>>(
      'SELECT billingUID FROM ServiceBillings WHERE submissionUID = ? AND billingStatus <> -1 ORDER BY billingUID',
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
  // policy). Only while the insurer has not answered: once a service billing
  // exists, the submission is history. A submission left without invoices is
  // deleted with it; an invoice left without any submission loses its
  // "billed" mark, which only applies to submitted invoices.
  router.delete('/:uid/invoices/:invoiceUID', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const invoiceUID = pathParam(req, 'invoiceUID');
    const account = await accountForSubmission(pool, uid);
    if (account === null) throw notFound('Submission');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);

    await withTransaction(pool, async (conn) => {
      await conn.query('SELECT submissionUID FROM Submissions WHERE submissionUID = ? FOR UPDATE', [
        uid,
      ]);
      const [billings] = await conn.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM ServiceBillings WHERE submissionUID = ? AND billingStatus <> -1',
        [uid],
      );
      if (Number(billings?.n ?? 0) > 0) {
        throw conflict('A submission with service billings cannot be withdrawn');
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
        await conn.query('UPDATE Submissions SET submissionStatus = -1 WHERE submissionUID = ?', [
          uid,
        ]);
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
