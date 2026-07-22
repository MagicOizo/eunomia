import assert from 'node:assert/strict';
import test from 'node:test';

import type { DatabaseConfig } from '../config/env.js';
import { runMigrations } from './migrate.js';
import { createPool, waitForDatabase } from './pool.js';
import { createMigrator } from './umzug.js';

const EXPECTED_TABLES = [
  'Accounts',
  'InsuranceCompanies',
  'Contracts',
  'Facilities',
  'CollectionAgencies',
  'Submissions',
  'Invoices',
  'ServiceBillings',
  'Allocations',
];

/** Reads DB config from the environment, or null when it isn't fully set. */
function databaseConfigFromEnv(): DatabaseConfig | null {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return null;
  return {
    host: DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
}

// This test needs a real MariaDB. It runs in CI (which provides one) and is
// skipped locally when no DB env is configured, so `npm test` stays runnable
// without a database.
test('migrations create every table and are idempotent', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }

  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  try {
    await runMigrations(pool);

    const rows = await pool.query<Array<{ name: string }>>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    const tableNames = rows.map((row) => row.name);
    for (const table of EXPECTED_TABLES) {
      assert.ok(tableNames.includes(table), `expected table ${table} to exist`);
    }

    // Running migrations a second time must change nothing (the Slice 2 DoD).
    const migrator = createMigrator(pool);
    const executedBefore = await migrator.executed();
    await migrator.up();
    const executedAfter = await migrator.executed();
    assert.deepEqual(executedAfter, executedBefore);
    assert.ok(executedBefore.length >= 1, 'at least one migration should be recorded');
  } finally {
    await pool.end();
  }
});
