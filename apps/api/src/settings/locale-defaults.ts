import { Router } from 'express';
import type { Pool } from 'mariadb';

import { sendData } from '../crud/envelope.js';
import { getLocaleDefaults } from './repository.js';

/**
 * The instance's default language and format, without a token (I-1's
 * exception list). The web resolves its language as profile → browser →
 * instance → German, and the login page has no profile yet: without this, an
 * instance set to English would greet a French browser in German. The answer
 * is the two values an admin chose for everybody — nothing about a user.
 */
export function createLocaleDefaultsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/locale-defaults', async (_req, res) => {
    sendData(res, await getLocaleDefaults(pool));
  });

  return router;
}
