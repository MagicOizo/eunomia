import { type Request, Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, createRequirePermission, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { optionalPathParam, pathParam } from '../crud/params.js';
import {
  type CrudTable,
  getRow,
  insertRow,
  listRows,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';

export const accountsTable: CrudTable = {
  table: 'Accounts',
  uidColumn: 'accountUID',
  statusColumn: 'accountStatus',
  entity: 'account',
  columns: ['surname', 'firstname', 'middlename', 'birthDate', 'leadAccountUID'],
};

const accountRef = z.string().regex(entityIdPattern(ENTITY_PREFIX.account));

const base = z.object({
  firstname: z.string().trim().min(1).max(50),
  surname: z.string().trim().min(1).max(50).nullish(),
  middlename: z.string().trim().min(1).max(50).nullish(),
  birthDate: z.string().date(),
  leadAccountUID: accountRef.nullish(),
});

const uidFromParams = (req: Request): string | undefined => optionalPathParam(req, 'uid');

/**
 * CRUD router for accounts (insured persons). Access is account-scoped: the
 * list is narrowed to the accounts the caller can view, and single-resource
 * routes are guarded per account UID. Creating a new account has no existing
 * account context, so it requires a GLOBAL MANAGE_ACCOUNTS grant.
 */
export function createAccountsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const canView = createRequirePermission(pool, PERMISSIONS.VIEW_ACCOUNTS, uidFromParams);
  const canManage = createRequirePermission(pool, PERMISSIONS.MANAGE_ACCOUNTS, uidFromParams);
  const canCreate = createRequirePermission(pool, PERMISSIONS.MANAGE_ACCOUNTS);

  router.get('/', requireAuth, async (_req, res) => {
    const user = getAuthUser(res);
    const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_ACCOUNTS);
    if (scope.all) {
      sendData(res, await listRows(pool, accountsTable));
      return;
    }
    if (scope.accountUIDs.length === 0) {
      sendData(res, []);
      return;
    }
    const placeholders = scope.accountUIDs.map(() => '?').join(', ');
    const rows = await listRows(pool, accountsTable, {
      clause: `accountUID IN (${placeholders})`,
      params: scope.accountUIDs,
    });
    sendData(res, rows);
  });

  router.get('/:uid', requireAuth, canView, async (req, res) => {
    const row = await getRow(pool, accountsTable, pathParam(req, 'uid'));
    if (!row) throw notFound('Account');
    sendData(res, row);
  });

  router.post('/', requireAuth, canCreate, async (req, res) => {
    const data = base.parse(req.body);
    sendData(res, await insertRow(pool, accountsTable, data), 201);
  });

  router.patch('/:uid', requireAuth, canManage, async (req, res) => {
    const data = base.partial().parse(req.body);
    const updated = await updateRow(pool, accountsTable, pathParam(req, 'uid'), data);
    if (!updated) throw notFound('Account');
    sendData(res, updated);
  });

  router.delete('/:uid', requireAuth, canManage, async (req, res) => {
    const deleted = await softDeleteRow(pool, accountsTable, pathParam(req, 'uid'));
    if (!deleted) throw notFound('Account');
    res.status(204).end();
  });

  return router;
}
