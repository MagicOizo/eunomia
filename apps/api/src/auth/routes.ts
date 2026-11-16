import {
  OIDC_CALLBACK_PATH,
  OIDC_START_PATH,
  type OidcLoginError,
  PERMISSIONS,
} from '@eunomia/shared';
import { type Response, Router } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './http.js';
import { createRequireAuth, getAuthUser } from './middleware.js';
import { clearFlowCookie, readFlowCookie, setFlowCookie } from './oidc/flow-state.js';
import { finishOidcLogin, startOidcLogin } from './oidc/login.js';
import type { OidcLoginDeps } from './oidc/provider.js';
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

/** Where this router is mounted (API_MOUNTS in app.ts); the OIDC paths are spelled in full in shared. */
const MOUNT = '/api/v1';

/**
 * A failed sign-in through the provider. The browser is navigating, not
 * fetching, so the answer is a redirect to the login page with the code rather
 * than a JSON error — an error object would be a blank page full of braces.
 * Relative, so it lands on whichever origin the browser is on (in dev, Vite's).
 */
export function redirectToLoginWithError(res: Response, code: OidcLoginError): void {
  res.redirect(302, `/login?oidcError=${encodeURIComponent(code)}`);
}

export interface AuthRouterDeps {
  /** openid-client as the sign-in uses it, stubbed in tests. */
  oidc?: OidcLoginDeps;
}

/**
 * Auth + rights routes, mounted under /api/v1. Handlers are async; thrown
 * AuthError/ZodError propagate to the shared error middleware (Express 5
 * forwards rejected promises automatically).
 */
export function createAuthRouter(pool: Pool, config: AppConfig, deps: AuthRouterDeps = {}): Router {
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

  // The sign-in through the provider (Slice 88): out to the provider with the
  // flow state in a cookie, back with a code that becomes the same session a
  // password earns. The access token never travels in a URL — the callback only
  // sets the refresh cookie, and the SPA's usual bootstrap (POST /auth/refresh)
  // turns it into an access token, as for a returning session.
  router.get(OIDC_START_PATH.slice(MOUNT.length), async (req, res) => {
    const started = await startOidcLogin(pool, config, req.ip, deps.oidc);
    if (!started.ok) {
      redirectToLoginWithError(res, started.code);
      return;
    }
    setFlowCookie(res, started.value.flowToken, config.isProduction);
    res.redirect(302, started.value.url.href);
  });

  router.get(OIDC_CALLBACK_PATH.slice(MOUNT.length), async (req, res) => {
    // One flow, one return — whatever comes of it.
    clearFlowCookie(res, config.isProduction);
    const queryStart = req.originalUrl.indexOf('?');
    const finished = await finishOidcLogin(
      pool,
      config,
      {
        query: queryStart === -1 ? '' : req.originalUrl.slice(queryStart),
        flowToken: readFlowCookie(req.headers.cookie),
        ip: req.ip,
      },
      deps.oidc,
    );
    if (!finished.ok) {
      redirectToLoginWithError(res, finished.code);
      return;
    }
    const session = finished.value;
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, config.isProduction);
    res.redirect(302, '/');
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
