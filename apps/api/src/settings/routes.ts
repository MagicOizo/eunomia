import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, createRequirePermission, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { type Mailer, type MailerDeps, createMailer } from '../mail/mailer.js';
import { createMailSettingsStore } from '../mail/store.js';
import { type SettingKey, type SettingValue, validateIncoming } from './registry.js';
import { getPublicSettings, setSettings } from './repository.js';

/**
 * The system settings API (see Notes/eunomia-plan.md, 2.6 / Slice 30), guarded
 * by MANAGE_SETTINGS: reading and writing the configuration, plus the test mail
 * that proves the SMTP account works.
 */

/**
 * A write is a partial map of setting keys to values. The three cases are
 * deliberately distinguishable, because "the form submitted every field" must
 * not be able to wipe a stored password:
 *   - key absent  → leave unchanged
 *   - value null  → clear (a secret is forgotten, everything else falls back)
 *   - value given → store
 * The registry validates each value; this schema only fixes the envelope.
 */
const updateSchema = z.object({
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export interface SettingsRouterDeps {
  /** Passed through to the mailer, so tests can inject a transport stub. */
  mailer?: Mailer;
  mailerDeps?: MailerDeps;
}

export function createSettingsRouter(
  pool: Pool,
  config: AppConfig,
  deps: SettingsRouterDeps = {},
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireSettings = createRequirePermission(pool, PERMISSIONS.MANAGE_SETTINGS);
  const mailer =
    deps.mailer ??
    createMailer(createMailSettingsStore(pool, config.configEncryptionKey), deps.mailerDeps);

  // Scoped to this router's own subtree, not blanket: mounted at /api/v1, a
  // router.use() without a path would guard every other router as well (see the
  // same note in auth/admin-routes.ts).
  router.use('/settings', requireAuth, requireSettings);

  /**
   * What both the read and the write answer with. Secrets appear as `isSet`
   * only — the plaintext never leaves the API, not even for an admin, so a
   * shoulder-surfed settings page does not hand over the mail password.
   */
  async function snapshot(): Promise<unknown> {
    return {
      settings: await getPublicSettings(pool),
      // Lets the page name the cause instead of showing a puzzling failure when
      // saving a password (see 2.6: the key lives in the environment).
      encryptionAvailable: config.configEncryptionKey !== null,
      mailStatus: await mailer.readStatus(),
    };
  }

  router.get('/settings', async (_req, res) => {
    sendData(res, await snapshot());
  });

  router.put('/settings', async (req, res) => {
    const { values } = updateSchema.parse(req.body);
    const updates = new Map<SettingKey, SettingValue>();
    for (const [key, value] of Object.entries(values)) {
      const [validKey, validValue] = validateIncoming(key, value);
      updates.set(validKey, validValue);
    }

    await setSettings(pool, updates, config.configEncryptionKey, getAuthUser(res).userId);

    sendData(res, await snapshot());
  });

  /**
   * Sends a test mail to the caller's own address. There is no recipient in the
   * body on purpose (decision of 2026-09-24): an instance configured with
   * someone's SMTP account must not double as a way to mail third parties.
   */
  router.post('/settings/mail/test', async (_req, res) => {
    const { email } = getAuthUser(res);
    sendData(res, { recipient: email, status: await mailer.sendTestMail(email) });
  });

  return router;
}
