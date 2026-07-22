import mariadb, { type Pool } from 'mariadb';

import type { DatabaseConfig } from '../config/env.js';

/**
 * Creates the shared MariaDB connection pool.
 *
 * `bigIntAsNumber` returns the auto-increment IDs as plain numbers rather
 * than BigInt (matching the first attempt's convention and keeping call
 * sites simple), and `decimalAsNumber` returns money columns as numbers so
 * callers don't have to parse DECIMAL strings. Both are safe here because
 * the values stay well within Number's exact-integer range.
 */
export function createPool(config: DatabaseConfig): Pool {
  return mariadb.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5,
    bigIntAsNumber: true,
    decimalAsNumber: true,
  });
}

/**
 * Waits for the database to accept connections, retrying with a fixed delay.
 * Even with `depends_on: service_healthy` in compose, the very first
 * connection can race the server becoming ready, so a short retry loop makes
 * container startup robust.
 */
export async function waitForDatabase(
  pool: Pool,
  { retries = 10, delayMs = 1000 }: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
