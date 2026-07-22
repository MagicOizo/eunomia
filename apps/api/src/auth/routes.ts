import { type Request, Router } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './http.js';
import { createRequireAuth, createRequirePermission, getAuthUser } from './middleware.js';
import { PERMISSIONS, getEffectivePermissions } from './permissions.js';
import type { AuthUser } from './repository.js';
import { loginSchema, setupSchema } from './schemas.js';
import { login, logout, refresh, setupFirstAdmin } from './service.js';

/** The public shape of a user — the enumerable numeric key never leaves here. */
function publicUser(user: AuthUser): Record<string, unknown> {
  return {
    uuid: user.uuidText,
    email: user.email,
    firstname: user.firstname,
    surname: user.surname,
  };
}

/**
 * Auth + rights routes, mounted under /api/v1. Handlers are async; thrown
 * AuthError/ZodError propagate to the shared error middleware (Express 5
 * forwards rejected promises automatically).
 */
export function createAuthRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  // One-time bootstrap of the first admin (gated by SETUP_TOKEN + empty Users).
  router.post('/setup', async (req, res) => {
    const input = setupSchema.parse(req.body);
    const providedToken = req.header('X-Setup-Token') ?? undefined;
    const user = await setupFirstAdmin(pool, config.auth, input, providedToken);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const session = await login(pool, config.auth, input);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, config.isProduction);
    res.json({ accessToken: session.accessToken, user: publicUser(session.user) });
  });

  router.post('/auth/refresh', async (req, res) => {
    const presented = readRefreshCookie(req.headers.cookie);
    const session = await refresh(pool, config.auth, presented);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, config.isProduction);
    res.json({ accessToken: session.accessToken, user: publicUser(session.user) });
  });

  router.post('/auth/logout', async (req, res) => {
    await logout(pool, readRefreshCookie(req.headers.cookie));
    clearRefreshCookie(res, config.isProduction);
    res.status(204).end();
  });

  // The authenticated user plus their effective permissions.
  router.get('/me', requireAuth, async (_req, res) => {
    const user = getAuthUser(res);
    const permissions = await getEffectivePermissions(pool, user.userId);
    res.json({ user: publicUser(user), permissions });
  });

  // Protected demo endpoints proving the guard works (Slice 3 DoD):
  // one instance-wide (global permission only)...
  router.get(
    '/admin/ping',
    requireAuth,
    createRequirePermission(pool, PERMISSIONS.MANAGE_USERS),
    (_req, res) => {
      res.json({ ok: true, scope: 'global' });
    },
  );

  // ...and one account-scoped (global OR a grant for this account).
  const accountUIDFromParams = (req: Request): string | undefined => {
    const value = req.params.accountUID;
    return typeof value === 'string' ? value : undefined;
  };
  router.get(
    '/accounts/:accountUID/ping',
    requireAuth,
    createRequirePermission(pool, PERMISSIONS.VIEW_INVOICES, accountUIDFromParams),
    (req, res) => {
      res.json({ ok: true, scope: 'account', accountUID: req.params.accountUID });
    },
  );

  return router;
}
