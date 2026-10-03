import { PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { readAppVersion } from '../lib/app-version.js';
import { createUpdateChecker } from '../lib/update-check.js';
import { getSettings } from '../settings/repository.js';

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
  const checkForUpdate = createUpdateChecker(config.updateCheck, readAppVersion(), {
    // Resolved per check, so a token entered in the settings page works at once
    // and without a restart (the `.env` value stays the fallback).
    resolveToken: async () => {
      const settings = await getSettings(pool, config.configEncryptionKey);
      const token = settings['updateCheck.token'];
      return typeof token === 'string' && token !== '' ? token : undefined;
    },
  });

  router.get('/update-check', requireAuth, requireSettings, async (_req, res) => {
    sendData(res, await checkForUpdate());
  });

  /**
   * Asks GitHub now instead of reusing the cached answer — the "check now"
   * button in the system settings. A POST, because it makes an outbound request
   * rather than reading local state.
   */
  router.post('/update-check/refresh', requireAuth, requireSettings, async (_req, res) => {
    sendData(res, await checkForUpdate({ force: true }));
  });

  return router;
}
