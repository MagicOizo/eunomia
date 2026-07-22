import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'mariadb';
import { Umzug } from 'umzug';

import { createMariadbStorage } from './storage.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Migration files are TypeScript modules (hand-written raw SQL, no ORM — see
 * Notes/eunomia-plan.md, 2.2). At dev time they run from src as `.ts` (via
 * tsx); in the production image they run from dist as compiled `.js`. We pick
 * the matching extension from this module's own URL so the same glob works in
 * both places without copying non-TS files into the build.
 */
const migrationExtension = import.meta.url.endsWith('.js') ? 'js' : 'ts';

/** Builds the Umzug instance bound to the given pool (used as migration context). */
export function createMigrator(pool: Pool): Umzug<Pool> {
  return new Umzug({
    migrations: {
      glob: `${currentDir}/migrations/*.${migrationExtension}`,
    },
    context: pool,
    storage: createMariadbStorage(pool),
    logger: console,
  });
}

/** Type a migration module's `up`/`down` receive, so migration files can import it. */
export type MigrationContext = { context: Pool };
