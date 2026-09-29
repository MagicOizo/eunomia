import { Router } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './http.js';
import { createRequireAuth, getAuthUser } from './middleware.js';
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
    // Admins are told whether the one-time setup endpoint is still open (its
    // SETUP_TOKEN is set), so they can be nudged to remove it. Gated on
    // MANAGE_USERS so a non-admin cannot probe whether setup is reachable.
    const isAdmin = permissions.global.includes(PERMISSIONS.MANAGE_USERS);
    const setupTokenActive = isAdmin && config.auth.setupToken !== undefined;
    res.json({ user: publicUser(user), permissions, setupTokenActive });
  });

  return router;
}
