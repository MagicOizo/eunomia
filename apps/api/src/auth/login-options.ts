import { Router } from 'express';
import type { Pool } from 'mariadb';

import { sendData } from '../crud/envelope.js';
import { getLoginOptions } from '../settings/repository.js';

/**
 * The ways in the login page offers, without a token (I-1's exception list,
 * Slice 89): whether the password form is open and whether there is a button
 * to the sign-in provider, with its text. Nothing about the provider itself —
 * the page links to `/auth/oidc/start`, which finds everything else there.
 */
export function createLoginOptionsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/login-options', async (_req, res) => {
    sendData(res, await getLoginOptions(pool));
  });

  return router;
}
