import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
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
  submissionUID: string | null;
}

/**
 * Validates that every requested invoice can join this submission: it must
 * exist and be active, belong to the contract's account, and not already be
 * submitted. Rejects with a descriptive 400/409 otherwise. Runs inside the
 * caller's transaction with row locks (FOR UPDATE) so two concurrent
 * submissions cannot both grab the same invoice.
 */
function assertInvoicesSubmittable(
  candidates: CandidateInvoice[],
  requested: string[],
  contractAccount: string,
): void {
  const byUid = new Map(candidates.map((c) => [c.invoiceUID, c]));

  const unknown = requested.filter((uid) => !byUid.has(uid));
  if (unknown.length > 0) {
    throw badRequest(`Unknown or inactive invoices: ${unknown.join(', ')}`);
  }
  const wrongAccount = requested.filter((uid) => byUid.get(uid)?.accountUID !== contractAccount);
  if (wrongAccount.length > 0) {
    throw badRequest(
      `Invoices do not belong to the contract's account: ${wrongAccount.join(', ')}`,
    );
  }
  const alreadySubmitted = requested.filter((uid) => byUid.get(uid)?.submissionUID !== null);
  if (alreadySubmitted.length > 0) {
    throw conflict(`Invoices are already submitted: ${alreadySubmitted.join(', ')}`);
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
      const candidates = await conn.query<CandidateInvoice[]>(
        `SELECT invoiceUID, accountUID, submissionUID
           FROM Invoices
          WHERE invoiceUID IN (${placeholders}) AND invoiceStatus <> -1
          FOR UPDATE`,
        input.invoiceUIDs,
      );
      assertInvoicesSubmittable(candidates, input.invoiceUIDs, contractAccount);

      const submissionUID = generateEntityId('submission');
      await conn.query(
        'INSERT INTO Submissions (submissionUID, contractUID, submittedDate) VALUES (?, ?, ?)',
        [submissionUID, input.contractUID, input.submittedDate],
      );
      await conn.query(
        `UPDATE Invoices SET submissionUID = ? WHERE invoiceUID IN (${placeholders})`,
        [submissionUID, ...input.invoiceUIDs],
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
              s.submissionStatus, c.accountUID
         FROM Submissions s
         JOIN Contracts c ON c.contractUID = s.contractUID
        WHERE ${where.join(' AND ')}
        ORDER BY s.submittedDate DESC, s.submissionUID`,
      params,
    );
    sendData(res, rows);
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
      'SELECT invoiceUID FROM Invoices WHERE submissionUID = ? AND invoiceStatus <> -1 ORDER BY invoiceUID',
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

  return router;
}
