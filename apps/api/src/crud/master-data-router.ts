import { Router } from 'express';
import type { Pool } from 'mariadb';
import type { z } from 'zod';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
import type { PermissionKey } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { notFound } from '../lib/api-error.js';
import { sendData } from './envelope.js';
import { pathParam } from './params.js';
import { type CrudTable, getRow, insertRow, listRows, softDeleteRow, updateRow } from './repository.js';

export interface MasterDataOptions {
  table: CrudTable;
  /** Human name used in "not found" messages, e.g. "Facility". */
  resource: string;
  /** Permission required to create/update/delete (viewing needs only auth). */
  managePermission: PermissionKey;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
}

/**
 * CRUD router for global master data (facilities, insurance companies,
 * collection agencies). These are not account-scoped: any authenticated user
 * may read them (they populate invoice forms), while creating, editing and
 * deleting require the entity's manage permission held globally.
 */
export function createMasterDataRouter(
  pool: Pool,
  config: AppConfig,
  opts: MasterDataOptions,
): Router {
  const { table, resource, managePermission, createSchema, updateSchema } = opts;
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireManage = createRequirePermission(pool, managePermission);

  router.get('/', requireAuth, async (_req, res) => {
    sendData(res, await listRows(pool, table));
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const row = await getRow(pool, table, pathParam(req, 'uid'));
    if (!row) throw notFound(resource);
    sendData(res, row);
  });

  router.post('/', requireAuth, requireManage, async (req, res) => {
    const data = createSchema.parse(req.body) as Record<string, unknown>;
    sendData(res, await insertRow(pool, table, data), 201);
  });

  router.patch('/:uid', requireAuth, requireManage, async (req, res) => {
    const data = updateSchema.parse(req.body) as Record<string, unknown>;
    const updated = await updateRow(pool, table, pathParam(req, 'uid'), data);
    if (!updated) throw notFound(resource);
    sendData(res, updated);
  });

  router.delete('/:uid', requireAuth, requireManage, async (req, res) => {
    const deleted = await softDeleteRow(pool, table, pathParam(req, 'uid'));
    if (!deleted) throw notFound(resource);
    res.status(204).end();
  });

  return router;
}
