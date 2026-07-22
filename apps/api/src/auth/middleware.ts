import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { forbidden, unauthenticated } from './errors.js';
import { type PermissionKey, hasPermission } from './permissions.js';
import { type AuthUser, findUserByUuid } from './repository.js';
import { verifyAccessToken } from './tokens.js';

const AUTH_USER_KEY = 'authUser';

/** Retrieves the authenticated user attached by requireAuth (throws if absent). */
export function getAuthUser(res: Response): AuthUser {
  const user = res.locals[AUTH_USER_KEY] as AuthUser | undefined;
  if (!user) throw new Error('getAuthUser called without requireAuth in the chain');
  return user;
}

/** Extracts the Bearer token from an Authorization header, or undefined. */
function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

/**
 * Verifies the access token and loads the current user onto `res.locals`.
 * Any failure (missing/invalid/expired token, unknown or deactivated user)
 * results in a uniform 401 rather than leaking which part failed.
 */
export function createRequireAuth(pool: Pool, config: AppConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const token = bearerToken(req.headers.authorization);
      if (!token) throw unauthenticated();

      let uuid: string;
      try {
        uuid = await verifyAccessToken(token, config.auth.jwtSecret);
      } catch {
        throw unauthenticated();
      }

      const user = await findUserByUuid(pool, uuid);
      if (!user || user.userStatus !== 1) throw unauthenticated();

      res.locals[AUTH_USER_KEY] = user;
    })().then(next, next);
  };
}

/**
 * Guards a route by permission. Must run after requireAuth. When
 * `accountUIDFrom` is given, the check is account-scoped: the permission is
 * satisfied by a global grant OR a grant scoped to that account (see
 * auth/permissions.ts). Without it, only a global grant passes.
 */
export function createRequirePermission(
  pool: Pool,
  permission: PermissionKey,
  accountUIDFrom?: (req: Request) => string | undefined,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const user = getAuthUser(res);
      const accountUID = accountUIDFrom?.(req);
      const allowed = await hasPermission(pool, user.userId, permission, accountUID);
      if (!allowed) throw forbidden();
    })().then(next, next);
  };
}
