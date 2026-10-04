import { ERROR_CODES, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, createRequirePermission, getAuthUser } from '../auth/middleware.js';
import { getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { ApiError } from '../lib/api-error.js';
import { auditSettingsChanged } from '../lib/audit.js';
import { type Mailer, type MailerDeps, createMailer } from '../mail/mailer.js';
import { createMailSettingsStore } from '../mail/store.js';
import {
  type ReminderPreview,
  type ReminderRunner,
  createReminderRunner,
} from '../reminders/runner.js';
import { createReminderStore } from '../reminders/store.js';
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

/** A reminder run asked for by hand, rather than by the clock. */
const runSchema = z.object({ dryRun: z.boolean().optional() });

export interface SettingsRouterDeps {
  /** Passed through to the mailer, so tests can inject a transport stub. */
  mailer?: Mailer;
  mailerDeps?: MailerDeps;
  /** Injectable for the same reason: a run without a real mail server. */
  reminderRunner?: ReminderRunner;
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
  const reminderRunner =
    deps.reminderRunner ??
    createReminderRunner(createReminderStore(pool, config.configEncryptionKey), mailer);

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

    // Keys only. A value here would mean the mail password in a log line the
    // moment someone changes it (SEC-09, rule 2 in lib/audit.ts) — and the one
    // place the plaintext is in reach is exactly this handler.
    const changed = [...updates.entries()];
    auditSettingsChanged({
      actor: getAuthUser(res).uuidText,
      set: changed.filter(([, value]) => value !== null).map(([key]) => key),
      cleared: changed.filter(([, value]) => value === null).map(([key]) => key),
    });

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

  /**
   * What of a dry run's preview this caller may read (SEC-03): a rendered mail
   * names invoice numbers, the treated person, the payee and the amount, and
   * MANAGE_SETTINGS says nothing about reading invoices. A text is shown only
   * when the caller holds VIEW_INVOICES on EVERY account it speaks about —
   * all or nothing per recipient, because a shortened text would show a mail
   * that is never sent that way. The rest are counted, not shown.
   */
  async function readableBy(
    userId: number,
    preview: ReminderPreview[],
  ): Promise<{ shown: Array<{ email: string; subject: string; text: string }>; hidden: number }> {
    const scope = await getAccessibleAccounts(pool, userId, PERMISSIONS.VIEW_INVOICES);
    const readable = preview.filter(
      (entry) => scope.all || entry.accountUIDs.every((uid) => scope.accountUIDs.includes(uid)),
    );
    return {
      shown: readable.map(({ email, subject, text }) => ({ email, subject, text })),
      hidden: preview.length - readable.length,
    };
  }

  /**
   * Runs the payment reminders now instead of waiting for the daily schedule.
   * `dryRun` renders everything and sends nothing, which is how an admin sees
   * what would go out before it goes out.
   *
   * With the reminders switched off this is a 409 rather than a silent no-op:
   * a button that mails every user while the feature reads "off" would be a
   * nasty surprise — the same caution as the test mail's missing recipient
   * field.
   */
  router.post('/settings/reminders/run', async (req, res) => {
    const { dryRun } = runSchema.parse(req.body ?? {});
    const result = await reminderRunner.run({ dryRun });

    if (result.skipped === 'disabled') {
      throw new ApiError(409, ERROR_CODES.REMINDERS_DISABLED, 'Payment reminders are switched off');
    }
    if (result.skipped === 'mail_not_configured') {
      throw new ApiError(
        409,
        ERROR_CODES.MAIL_NOT_CONFIGURED,
        'Mail delivery is switched off or incompletely configured',
      );
    }

    // The rendered texts are only interesting for a preview; a real run has
    // already delivered them.
    const preview =
      dryRun === true
        ? await readableBy(getAuthUser(res).userId, result.preview)
        : { shown: [], hidden: 0 };
    sendData(res, { ...result, preview: preview.shown, previewHidden: preview.hidden });
  });

  return router;
}
