import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type CrudTable, getRow, insertRow, softDeleteRow } from '../crud/repository.js';
import { badRequest, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { authorizeAccount } from './workflow-access.js';

const table: CrudTable = {
  table: 'Allocations',
  uidColumn: 'allocationUID',
  statusColumn: 'allocationStatus',
  entity: 'allocation',
  columns: ['invoiceUID', 'billingUID', 'receiptNumber', 'reimbursement'],
};

const createSchema = z.object({
  invoiceUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.invoice)),
  billingUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.serviceBilling)),
  receiptNumber: z.string().trim().min(1).max(50).nullish(),
  reimbursement: z.number().min(0).max(99999999.99),
});

/** Router for allocations: mapping a service billing's reimbursement to an invoice. */
export function createAllocationsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = createSchema.parse(req.body);

    const [billing] = await pool.query<Array<{ submissionUID: string; accountUID: string }>>(
      `SELECT b.submissionUID, c.accountUID
         FROM ServiceBillings b
         JOIN Submissions s ON s.submissionUID = b.submissionUID
         JOIN Contracts c ON c.contractUID = s.contractUID
        WHERE b.billingUID = ? AND b.billingStatus <> -1
        LIMIT 1`,
      [data.billingUID],
    );
    if (!billing) throw notFound('Service billing');

    const [invoice] = await pool.query<Array<{ submissionUID: string | null }>>(
      'SELECT submissionUID FROM Invoices WHERE invoiceUID = ? AND invoiceStatus <> -1 LIMIT 1',
      [data.invoiceUID],
    );
    if (!invoice) throw notFound('Invoice');

    // The core cross-entity invariant: an invoice can only be allocated a
    // reimbursement from a billing of the very submission it was submitted in.
    if (invoice.submissionUID === null || invoice.submissionUID !== billing.submissionUID) {
      throw badRequest('Invoice and service billing must belong to the same submission');
    }

    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, billing.accountUID);
    sendData(res, await insertRow(pool, table, data), 201);
  });

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
