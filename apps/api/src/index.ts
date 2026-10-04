import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { startRefreshTokenCleanup } from './auth/cleanup.js';
import { runMigrations } from './db/migrate.js';
import { createPool, waitForDatabase } from './db/pool.js';
import { createMailer } from './mail/mailer.js';
import { createMailSettingsStore } from './mail/store.js';
import { createReminderRunner } from './reminders/runner.js';
import { startReminderScheduler } from './reminders/schedule.js';
import { createReminderStore } from './reminders/store.js';
import { startRetentionSweep } from './retention/sweep.js';

const config = loadConfig();
const pool = createPool(config.database);

// Bring the schema up to date before serving any traffic. Combined with a
// restored older backup, this is also the upgrade path (see
// Notes/eunomia-plan.md, 2.1).
await waitForDatabase(pool);
await runMigrations(pool);

// The built SPA sits next to the compiled API in the production image
// (/app/apps/web/dist). Absent in dev, where Vite serves it — createApp only
// serves it when the directory exists.
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = process.env.WEB_ROOT ?? join(here, '..', '..', 'web', 'dist');

const app = createApp({ pool, config, webRoot });

const server = app.listen(config.port, () => {
  console.log(`Eunomia API listening on port ${config.port}`);
});

/*
 * The payment reminders are the one thing that has to happen without anyone
 * asking (Slice 31), so the timer lives here and not in createApp(): that
 * builds the app for supertest too, and a test suite must not start sending
 * mail in the background. The schedule itself is in the settings; while the
 * reminders are switched off the ticks do nothing but read them.
 */
const reminderStore = createReminderStore(pool, config.configEncryptionKey);
const reminders = createReminderRunner(
  reminderStore,
  createMailer(createMailSettingsStore(pool, config.configEncryptionKey)),
);
const scheduler = startReminderScheduler({
  readSchedule: async () => {
    const settings = await reminderStore.readSettings();
    const { lastRunAt } = await reminderStore.readStatus();
    return { ...settings, lastRunAt };
  },
  run: () => reminders.run(),
});

/*
 * Expired and long-revoked refresh tokens are swept daily (SEC-08). Here for
 * the same reason as the scheduler above: createApp() builds the app for
 * supertest too, and a test suite must not start deleting rows in the
 * background.
 */
const tokenCleanup = startRefreshTokenCleanup(pool, {
  retentionMs: config.auth.refreshTokenTtlSeconds * 1000,
});

/*
 * The retention period empties the trash of what has aged out of it (SEC-15),
 * here for the same reason as the two timers above. While it is switched off —
 * which it is until an administrator says otherwise — the tick only reads the
 * settings.
 */
const retention = startRetentionSweep(pool, { encryptionKey: config.configEncryptionKey });

/** Closes the HTTP server and database pool on shutdown signals. */
async function shutdown(): Promise<void> {
  scheduler.stop();
  tokenCleanup.stop();
  retention.stop();
  server.close();
  await pool.end();
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
