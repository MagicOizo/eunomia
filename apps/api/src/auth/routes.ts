import { PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './http.js';
import { createRequireAuth, getAuthUser } from './middleware.js';
import { getEffectivePermissions } from './permissions.js';
import { type AuthUser, findUserByUuid, updateLocalePreferences } from './repository.js';
import {
  changePasswordSchema,
  localePreferencesSchema,
  loginSchema,
  setupSchema,
} from './schemas.js';
import { changeOwnPassword, login, logout, refresh, setupFirstAdmin } from './service.js';

/** The public shape of a user — the enumerable numeric key never leaves here. */
function publicUser(user: AuthUser): Record<string, unknown> {
  return {
    uuid: user.uuidText,
    email: user.email,
    firstname: user.firstname,
    surname: user.surname,
    locale: user.locale,
    formatRegion: user.formatRegion,
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
    const user = await setupFirstAdmin(pool, config.auth, input, providedToken, req.ip);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const session = await login(pool, config.auth, input, req.ip);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, config.isProduction);
    res.json({ accessToken: session.accessToken, user: publicUser(session.user) });
  });

  router.post('/auth/refresh', async (req, res) => {
    const presented = readRefreshCookie(req.headers.cookie);
    const session = await refresh(pool, config.auth, presented);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, config.isProduction);
    res.json({ accessToken: session.accessToken, user: publicUser(session.user) });
  });

  // Everyone changes their own password here, and only here — the admin API
  // refuses it for one's own account (auth/admin-routes.ts), so a new password
  // for oneself always costs the old one.
  router.post('/auth/password', requireAuth, async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    await changeOwnPassword(
      pool,
      getAuthUser(res),
      input,
      readRefreshCookie(req.headers.cookie),
      req.ip,
    );
    res.status(204).end();
  });

  router.post('/auth/logout', async (req, res) => {
    await logout(pool, readRefreshCookie(req.headers.cookie), req.ip);
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

  // One's own language and format — a personal choice like the password, so no
  // permission beyond being signed in.
  router.patch('/me', requireAuth, async (req, res) => {
    const input = localePreferencesSchema.parse(req.body);
    const user = getAuthUser(res);
    await updateLocalePreferences(pool, user.userId, input);
    const updated = await findUserByUuid(pool, user.uuidText);
    res.json({ user: publicUser(updated ?? user) });
  });

  return router;
}
