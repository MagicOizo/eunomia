import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { forbidden } from '../auth/errors.js';
import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts, hasPermission } from '../auth/permissions.js';
import type { PermissionKey } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type CrudTable, getRow, insertRow, listRows, softDeleteRow, updateRow } from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';

const table: CrudTable = {
  table: 'Contracts',
  uidColumn: 'contractUID',
  statusColumn: 'contractStatus',
  entity: 'contract',
  columns: [
    'contractNumber',
    'companyUID',
    'accountUID',
    'contractBegin',
    'contractEnd',
    'deductible',
    'reimbursementCap',
    'monthlyRate',
    'bonus',
  ],
};

const money = z.number().min(0).max(999999.99);

const base = z.object({
  contractNumber: z.string().trim().min(1).max(50),
  companyUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.company)),
  accountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.account)),
  contractBegin: z.string().date(),
  contractEnd: z.string().date().nullish(),
  deductible: money.optional(),
  reimbursementCap: money.nullish(),
  monthlyRate: money.optional(),
  bonus: money.optional(),
});

// accountUID is immutable: a contract belongs to one insured person for life,
// and allowing a move would require permission on both the old and new account.
const updateSchema = base.omit({ accountUID: true }).partial();

/**
 * CRUD router for insurance contracts. A contract is scoped to its owning
 * account, so every check resolves the permission against that account's UID:
 * on create it comes from the request body, on the single-resource routes it
 * comes from the stored contract.
 */
export function createContractsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  /** Loads a contract and asserts the caller holds `permission` on its account. */
  async function loadAuthorizedContract(
    userId: number,
    uid: string,
    permission: PermissionKey,
  ): Promise<Record<string, unknown>> {
    const contract = await getRow(pool, table, uid);
    if (!contract) throw notFound('Contract');
    const allowed = await hasPermission(pool, userId, permission, contract.accountUID as string);
    if (!allowed) throw forbidden();
    return contract;
  }

  router.get('/', requireAuth, async (_req, res) => {
    const user = getAuthUser(res);
    const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_CONTRACTS);
    if (scope.all) {
      sendData(res, await listRows(pool, table));
      return;
    }
    if (scope.accountUIDs.length === 0) {
      sendData(res, []);
      return;
    }
    const placeholders = scope.accountUIDs.map(() => '?').join(', ');
    sendData(
      res,
      await listRows(pool, table, {
        clause: `accountUID IN (${placeholders})`,
        params: scope.accountUIDs,
      }),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.VIEW_CONTRACTS,
    );
    sendData(res, contract);
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    const allowed = await hasPermission(pool, user.userId, PERMISSIONS.MANAGE_CONTRACTS, data.accountUID);
    if (!allowed) throw forbidden();
    sendData(res, await insertRow(pool, table, data), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await loadAuthorizedContract(user.userId, uid, PERMISSIONS.MANAGE_CONTRACTS);
    const data = updateSchema.parse(req.body);
    const updated = await updateRow(pool, table, uid, data);
    if (!updated) throw notFound('Contract');
    sendData(res, updated);
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await loadAuthorizedContract(user.userId, uid, PERMISSIONS.MANAGE_CONTRACTS);
    await softDeleteRow(pool, table, uid);
    res.status(204).end();
  });

  return router;
}
