import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { readAppVersion } from '../lib/app-version.js';
import { createUpdateChecker } from '../lib/update-check.js';

/**
 * Tells admins whether a newer release is published (see Notes/eunomia-plan.md,
 * 2.5). Unlike the public version endpoint this one is authenticated and
 * permission-guarded: only someone who could actually perform the update needs
 * to know, and the answer reveals which version this instance runs.
 *
 * The checker is created once per router so its cache survives across requests
 * — the footer asks on every page load.
 */
export function createUpdateCheckRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireSettings = createRequirePermission(pool, PERMISSIONS.MANAGE_SETTINGS);
  const checkForUpdate = createUpdateChecker(config.updateCheck, readAppVersion());

  router.get('/update-check', requireAuth, requireSettings, async (_req, res) => {
    sendData(res, await checkForUpdate());
  });

  return router;
}
