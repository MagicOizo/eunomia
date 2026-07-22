import type { Pool } from 'mariadb';

import { loadConfig } from '../config/env.js';
import { createPool, waitForDatabase } from './pool.js';
import { createMigrator } from './umzug.js';

/** Applies all pending migrations against the given pool. */
export async function runMigrations(pool: Pool): Promise<void> {
  const migrator = createMigrator(pool);
  await migrator.up();
}

/**
 * Standalone entry point for `npm run migrate` and for the restore path
 * (after importing an older backup, running this brings the schema up to the
 * current version — see Notes/eunomia-plan.md, 2.1). Creates its own pool,
 * waits for the database, migrates, and always closes the pool.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.database);
  try {
    await waitForDatabase(pool);
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

// Run only when invoked directly (node dist/db/migrate.js), not when imported.
if (process.argv[1] && fileIsMainModule(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  });
}

/** True when this module is the process entry point (handles the file:// URL form). */
function fileIsMainModule(moduleUrl: string, argvPath: string): boolean {
  return moduleUrl === `file://${argvPath}` || moduleUrl.endsWith(argvPath);
}
