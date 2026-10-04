import type { Pool } from 'mariadb';

import { loadConfig } from '../config/env.js';
import { createPool, waitForDatabase } from './pool.js';
import { withConnection } from './transaction.js';
import { createMigrator } from './umzug.js';

/** The advisory lock that serialises migration runs across instances (the test takes it too). */
export const MIGRATION_LOCK = 'eunomia:migrate';

/** How long a second instance waits for the first one's migrations, in seconds. */
const MIGRATION_LOCK_TIMEOUT_SECONDS = 60;

/** Options for {@link runMigrations}. */
export interface MigrationOptions {
  /** Overrides the lock timeout — only the test shortens it. */
  lockTimeoutSeconds?: number;
}

/**
 * Applies all pending migrations against the given pool, one instance at a
 * time.
 *
 * umzug's `schema_migrations` table does not serialise anything on its own —
 * the row is written after the migration ran, so two containers starting
 * together would apply the same migration twice. The named lock closes that
 * window: the second instance waits for the first one and then finds nothing
 * left to do. It lives on a session of its own, because migrations autocommit
 * and must not be wrapped in a transaction of ours.
 */
export async function runMigrations(pool: Pool, options: MigrationOptions = {}): Promise<void> {
  const timeout = options.lockTimeoutSeconds ?? MIGRATION_LOCK_TIMEOUT_SECONDS;
  await withConnection(pool, async (conn) => {
    // GET_LOCK answers 1 for the lock, 0 on timeout, NULL on error.
    const rows = await conn.query<Array<{ locked: number | null }>>(
      'SELECT GET_LOCK(?, ?) AS locked',
      [MIGRATION_LOCK, timeout],
    );
    if (rows[0]?.locked !== 1) {
      throw new Error(
        `Migrations are locked by another instance (waited ${String(timeout)}s for '${MIGRATION_LOCK}'). Run exactly one API container.`,
      );
    }
    try {
      await createMigrator(pool).up();
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK]);
    }
  });
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
