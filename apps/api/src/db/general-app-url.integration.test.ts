import assert from 'node:assert/strict';
import test from 'node:test';

import { createReminderStore } from '../reminders/store.js';
import { openTestDatabase } from '../test/harness.js';
import { runMigrations } from './migrate.js';
import { down, up } from './migrations/021-general-app-url.js';

async function storedKeys(
  pool: Parameters<typeof up>[0]['context'],
): Promise<Array<{ settingKey: string; settingValue: string }>> {
  return pool.query(
    "SELECT settingKey, settingValue FROM SystemSettings WHERE settingKey LIKE '%appUrl'",
  );
}

// Migration 021 moves a stored instance address to its new key instead of
// leaving it behind under a name the registry no longer reads.
test('migration 021 renames reminders.appUrl to general.appUrl and back', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool } = opened;

  try {
    await runMigrations(pool);
    await pool.query("DELETE FROM SystemSettings WHERE settingKey LIKE '%appUrl'");
    await pool.query(
      "INSERT INTO SystemSettings (settingKey, settingValue) VALUES ('reminders.appUrl', 'https://eunomia.example.com')",
    );

    await up({ context: pool } as Parameters<typeof up>[0]);
    assert.deepEqual(await storedKeys(pool), [
      { settingKey: 'general.appUrl', settingValue: 'https://eunomia.example.com' },
    ]);
    // The reminder mail reads the address from its new place.
    const settings = await createReminderStore(pool, null).readSettings();
    assert.equal(settings.appUrl, 'https://eunomia.example.com');

    await down({ context: pool } as Parameters<typeof down>[0]);
    assert.deepEqual(await storedKeys(pool), [
      { settingKey: 'reminders.appUrl', settingValue: 'https://eunomia.example.com' },
    ]);
  } finally {
    await pool.query("DELETE FROM SystemSettings WHERE settingKey LIKE '%appUrl'");
    await pool.end();
  }
});
