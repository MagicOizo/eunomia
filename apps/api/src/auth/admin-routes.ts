import { ERROR_CODES, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { placeholders } from '../crud/repository.js';
import { badRequest, notFound } from '../lib/api-error.js';
import {
  auditUserCreated,
  auditUserDeactivated,
  auditUserRolesChanged,
  auditUserUpdated,
} from '../lib/audit.js';
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
import { createUser, deleteActiveRefreshTokens } from './repository.js';

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

/**
 * Both lists replace what a user holds, so the empty list is the way to take
 * everything away and has to stay allowed. The upper bound is there because
 * each entry is its own INSERT in one transaction (SEC-11); 100 roles or 100
 * account grants on one user is already far past anything real.
 */
const globalRolesSchema = z.object({ roleUIDs: z.array(roleRef).max(100) });
const accountRolesSchema = z.object({
  grants: z.array(z.object({ accountUID: accountRef, roleUID: roleRef })).max(100),
});

/**
 * The user id in the path. Users are addressed by their UUID (migration 002),
 * so a path segment that is not one is a malformed call, not a missing user —
 * 400 rather than a lookup that can only end in 404.
 */
function userUuid(req: Request): string {
  const uuid = pathParam(req, 'uuid');
  if (!z.string().uuid().safeParse(uuid).success) {
    throw badRequest("Invalid path parameter 'uuid': must be a UUID");
  }
  return uuid;
}

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
      throw badRequest('This action is not possible on your own account', {
        code: ERROR_CODES.SELF_ACCOUNT_ACTION,
      });
    }
  }

  /** Rejects changes that would remove the last remaining active administrator. */
  async function assertKeepsAnAdmin(uuid: string, willRemainAdmin: boolean): Promise<void> {
    if (willRemainAdmin) return;
    if ((await isActiveAdmin(pool, uuid)) && (await countActiveAdmins(pool)) <= 1) {
      throw badRequest('The last active administrator cannot be removed or deactivated', {
        code: ERROR_CODES.LAST_ADMIN,
      });
    }
  }

  async function requireUserId(uuid: string): Promise<number> {
    const userId = await userIdByUuid(pool, uuid);
    if (userId === null) throw notFound('User');
    return userId;
  }

  router.get('/users', async (_req, res) => {
    sendData(res, await listUsers(pool));
  });

  router.get('/users/:uuid', async (req, res) => {
    const user = await getUser(pool, userUuid(req));
    if (!user) throw notFound('User');
    sendData(res, user);
  });

  router.post('/users', async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const created = await createUser(pool, {
      email: input.email,
      firstname: input.firstname,
      surname: input.surname ?? null,
      passwordHash: await hashPassword(input.password),
    });
    auditUserCreated({ actor: getAuthUser(res).uuidText, user: created.uuidText });
    sendData(res, await getUser(pool, created.uuidText), 201);
  });

  router.patch('/users/:uuid', async (req, res) => {
    const uuid = userUuid(req);
    const input = updateUserSchema.parse(req.body);
    const userId = await requireUserId(uuid);

    if (input.status === 0) {
      assertNotSelf(res, uuid);
      await assertKeepsAnAdmin(uuid, false);
    }
    // One's own password goes through POST /auth/password, which asks for the
    // old one. Allowing it here would leave a way to set it without knowing it
    // — and the revocation below would end the caller's own session (SEC-05/06).
    if (input.password !== undefined) assertNotSelf(res, uuid);

    await updateUser(pool, uuid, {
      email: input.email,
      firstname: input.firstname,
      surname: input.surname,
      status: input.status,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    });
    // A new password is exactly the situation one changes a password for, so
    // the sessions it was meant to lock out have to go with it (SEC-05).
    if (input.password !== undefined) await deleteActiveRefreshTokens(pool, userId);
    // The keys the body carried, never their values — `password` appears here
    // as a name and nowhere as a secret (SEC-09, rule 1 in lib/audit.ts).
    auditUserUpdated({
      actor: getAuthUser(res).uuidText,
      user: uuid,
      fields: Object.keys(input),
      status: input.status,
    });
    sendData(res, await getUser(pool, uuid));
  });

  router.delete('/users/:uuid', async (req, res) => {
    const uuid = userUuid(req);
    await requireUserId(uuid);
    assertNotSelf(res, uuid);
    await assertKeepsAnAdmin(uuid, false);
    const affected = await softDeleteUser(pool, uuid);
    if (affected === 0) throw notFound('User');
    auditUserDeactivated({ actor: getAuthUser(res).uuidText, user: uuid });
    res.status(204).end();
  });

  router.put('/users/:uuid/global-roles', async (req, res) => {
    const uuid = userUuid(req);
    const { roleUIDs } = globalRolesSchema.parse(req.body);
    const userId = await requireUserId(uuid);

    // Determine whether the new set still grants the Admin role.
    const names =
      roleUIDs.length === 0
        ? []
        : await pool.query<Array<{ roleName: string }>>(
            `SELECT roleName FROM Roles WHERE roleUID IN (${placeholders(roleUIDs)})`,
            roleUIDs,
          );
    const willRemainAdmin = names.some((n) => n.roleName === 'Admin');
    await assertKeepsAnAdmin(uuid, willRemainAdmin);

    await setGlobalRoles(pool, userId, roleUIDs);
    auditUserRolesChanged({
      actor: getAuthUser(res).uuidText,
      user: uuid,
      scope: 'global',
      roles: roleUIDs,
    });
    sendData(res, await getUser(pool, uuid));
  });

  router.put('/users/:uuid/account-roles', async (req, res) => {
    const uuid = userUuid(req);
    const { grants } = accountRolesSchema.parse(req.body);
    const userId = await requireUserId(uuid);
    await setAccountRoles(pool, userId, grants);
    auditUserRolesChanged({
      actor: getAuthUser(res).uuidText,
      user: uuid,
      scope: 'account',
      roles: grants.map((grant) => `${grant.accountUID}:${grant.roleUID}`),
    });
    sendData(res, await getUser(pool, uuid));
  });

  router.get('/roles', async (_req, res) => {
    sendData(res, await listRoles(pool));
  });

  return router;
}
