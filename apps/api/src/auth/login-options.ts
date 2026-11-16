import type { LoginOptions } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { readLoginSwitches } from '../settings/repository.js';
import { passwordLoginOpen } from './password-login.js';

/**
 * The ways in the login page offers, without a token (I-1's exception list,
 * Slice 89): whether the password form is open — the same decision the login
 * endpoint makes (Slice 90) — and whether there is a button to the sign-in
 * provider, with its text. Nothing about the provider itself: the page links
 * to `/auth/oidc/start`, which finds everything else there.
 */
export function createLoginOptionsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();

  router.get('/login-options', async (_req, res) => {
    const switches = await readLoginSwitches(pool);
    const options: LoginOptions = {
      password: passwordLoginOpen(switches.passwordEnabled, config.auth),
      oidc: switches.oidcEnabled ? { label: switches.oidcLabel } : null,
    };
    sendData(res, options);
  });

  return router;
}
