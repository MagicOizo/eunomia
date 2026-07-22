import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type CrudTable, getRow, insertRow, softDeleteRow, updateRow } from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { accountForBilling, accountForSubmission, authorizeAccount } from './workflow-access.js';

const table: CrudTable = {
  table: 'ServiceBillings',
  uidColumn: 'billingUID',
  statusColumn: 'billingStatus',
  entity: 'serviceBilling',
  columns: ['submissionUID', 'billingDate', 'billingNumber', 'documentLink'],
};

const base = z.object({
  submissionUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.submission)),
  billingDate: z.string().date(),
  billingNumber: z.string().trim().min(1).max(50),
  documentLink: z.string().trim().url().max(255).nullish(),
});

// A billing stays with its submission; only its own fields are editable.
const updateSchema = base.omit({ submissionUID: true }).partial();

/** Router for service billings (Leistungsabrechnungen), attached to a submission. */
export function createServiceBillingsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const where = ['b.billingStatus <> -1'];
    const params: unknown[] = [];

    const submissionUID = typeof req.query.submissionUID === 'string' ? req.query.submissionUID : undefined;
    if (submissionUID !== undefined) {
      const account = await accountForSubmission(pool, submissionUID);
      if (account === null) throw notFound('Submission');
      await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, account);
      where.push('b.submissionUID = ?');
      params.push(submissionUID);
    } else {
      const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_INVOICES);
      if (!scope.all) {
        if (scope.accountUIDs.length === 0) {
          sendData(res, []);
          return;
        }
        where.push(`c.accountUID IN (${scope.accountUIDs.map(() => '?').join(', ')})`);
        params.push(...scope.accountUIDs);
      }
    }

    const rows = await pool.query(
      `SELECT b.billingUID, b.submissionUID, b.billingDate, b.billingNumber, b.documentLink, b.billingStatus
         FROM ServiceBillings b
         JOIN Submissions s ON s.submissionUID = b.submissionUID
         JOIN Contracts c ON c.contractUID = s.contractUID
        WHERE ${where.join(' AND ')}
        ORDER BY b.billingDate DESC, b.billingUID`,
      params,
    );
    sendData(res, rows);
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForBilling(pool, uid);
    if (account === null) throw notFound('Service billing');
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, account);
    sendData(res, await getRow(pool, table, uid));
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    const account = await accountForSubmission(pool, data.submissionUID);
    if (account === null) throw notFound('Submission');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    sendData(res, await insertRow(pool, table, data), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForBilling(pool, uid);
    if (account === null) throw notFound('Service billing');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    const updated = await updateRow(pool, table, uid, updateSchema.parse(req.body));
    sendData(res, updated);
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForBilling(pool, uid);
    if (account === null) throw notFound('Service billing');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    await softDeleteRow(pool, table, uid);
    res.status(204).end();
  });

  return router;
}
