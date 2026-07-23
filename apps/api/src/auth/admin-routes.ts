import { Router } from 'express';
import type { Response } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { badRequest, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import {
  countActiveAdmins,
  getUser,
  isActiveAdmin,
  listRoles,
  listUsers,
  setAccountRoles,
  setGlobalRoles,
  softDeleteUser,
  updateUser,
  userIdByUuid,
} from './admin-repository.js';
import { createRequireAuth, createRequirePermission, getAuthUser } from './middleware.js';
import { PERMISSIONS } from './permissions.js';
import { createUser } from './repository.js';

const roleRef = z.string().regex(entityIdPattern(ENTITY_PREFIX.role));
const accountRef = z.string().regex(entityIdPattern(ENTITY_PREFIX.account));

const createUserSchema = z.object({
  email: z.string().trim().email(),
  firstname: z.string().trim().min(1).max(50),
  surname: z.string().trim().min(1).max(50).nullish(),
  password: z.string().min(8),
});

const updateUserSchema = z.object({
  email: z.string().trim().email().optional(),
  firstname: z.string().trim().min(1).max(50).optional(),
  surname: z.string().trim().min(1).max(50).nullish(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  password: z.string().min(8).optional(),
});

const globalRolesSchema = z.object({ roleUIDs: z.array(roleRef) });
const accountRolesSchema = z.object({
  grants: z.array(z.object({ accountUID: accountRef, roleUID: roleRef })),
});

/** Admin user/role management, gated globally by MANAGE_USERS (see Slice 9). */
export function createUserAdminRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireManageUsers = createRequirePermission(pool, PERMISSIONS.MANAGE_USERS);
  // Scope the guard to this router's own subtrees only. Mounted at /api/v1, a
  // blanket router.use() would run for every /api/v1/* request (accounts, …)
  // and wrongly 403 non-admins before the other routers are reached.
  router.use('/users', requireAuth, requireManageUsers);
  router.use('/roles', requireAuth, requireManageUsers);

  /** Rejects an operation on the caller's own account. */
  function assertNotSelf(res: Response, uuid: string): void {
    if (getAuthUser(res).uuidText === uuid) {
      throw badRequest('Diese Aktion ist für das eigene Konto nicht möglich.');
    }
  }

  /** Rejects changes that would remove the last remaining active administrator. */
  async function assertKeepsAnAdmin(uuid: string, willRemainAdmin: boolean): Promise<void> {
    if (willRemainAdmin) return;
    if ((await isActiveAdmin(pool, uuid)) && (await countActiveAdmins(pool)) <= 1) {
      throw badRequest('Der letzte aktive Administrator kann nicht entfernt oder deaktiviert werden.');
    }
  }

  async function requireUserId(uuid: string): Promise<number> {
    const userId = await userIdByUuid(pool, uuid);
    if (userId === null) throw notFound('User');
    return userId;
  }

  router.get('/users', async (_req, res) => {
    res.json({ data: await listUsers(pool) });
  });

  router.get('/users/:uuid', async (req, res) => {
    const user = await getUser(pool, req.params.uuid);
    if (!user) throw notFound('User');
    res.json({ data: user });
  });

  router.post('/users', async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const created = await createUser(pool, {
      email: input.email,
      firstname: input.firstname,
      surname: input.surname ?? null,
      passwordHash: await hashPassword(input.password),
    });
    res.status(201).json({ data: await getUser(pool, created.uuidText) });
  });

  router.patch('/users/:uuid', async (req, res) => {
    const uuid = req.params.uuid;
    const input = updateUserSchema.parse(req.body);
    await requireUserId(uuid);

    if (input.status === 0) {
      assertNotSelf(res, uuid);
      await assertKeepsAnAdmin(uuid, false);
    }

    await updateUser(pool, uuid, {
      email: input.email,
      firstname: input.firstname,
      surname: input.surname,
      status: input.status,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    });
    res.json({ data: await getUser(pool, uuid) });
  });

  router.delete('/users/:uuid', async (req, res) => {
    const uuid = req.params.uuid;
    await requireUserId(uuid);
    assertNotSelf(res, uuid);
    await assertKeepsAnAdmin(uuid, false);
    const affected = await softDeleteUser(pool, uuid);
    if (affected === 0) throw notFound('User');
    res.status(204).end();
  });

  router.put('/users/:uuid/global-roles', async (req, res) => {
    const uuid = req.params.uuid;
    const { roleUIDs } = globalRolesSchema.parse(req.body);
    const userId = await requireUserId(uuid);

    // Determine whether the new set still grants the Admin role.
    const names =
      roleUIDs.length === 0
        ? []
        : await pool.query<Array<{ roleName: string }>>(
            `SELECT roleName FROM Roles WHERE roleUID IN (${roleUIDs.map(() => '?').join(', ')})`,
            roleUIDs,
          );
    const willRemainAdmin = names.some((n) => n.roleName === 'Admin');
    await assertKeepsAnAdmin(uuid, willRemainAdmin);

    await setGlobalRoles(pool, userId, roleUIDs);
    res.json({ data: await getUser(pool, uuid) });
  });

  router.put('/users/:uuid/account-roles', async (req, res) => {
    const uuid = req.params.uuid;
    const { grants } = accountRolesSchema.parse(req.body);
    const userId = await requireUserId(uuid);
    await setAccountRoles(pool, userId, grants);
    res.json({ data: await getUser(pool, uuid) });
  });

  router.get('/roles', async (_req, res) => {
    res.json({ data: await listRoles(pool) });
  });

  return router;
}
