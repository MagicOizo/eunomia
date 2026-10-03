import type { Pool } from 'mariadb';

import { logEvent } from '../lib/log.js';
import { deleteStaleRefreshTokens } from './repository.js';

/**
 * Housekeeping for `RefreshTokens` (SEC-08). Every login and every rotation
 * writes a row and nothing ever took one away, so the table only grew.
 *
 * The security review suggested hanging this on the daily reminder tick, but
 * that tick returns at once while the reminders are switched off
 * (reminders/schedule.ts) — the hygiene of the session table would then depend
 * on someone having configured a mail account. A timer of its own needs no
 * setting, no hour and no watermark: a DELETE on indexed columns does not care
 * what time it is.
 */

/** How often the sweep runs. Once a day is plenty for rows that age in weeks. */
export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface CleanupOptions {
  /**
   * How long a revoked row is kept. This is the detection window of SEC-07, not
   * politeness: a deleted row turns a reused token back into an unknown one.
   * One refresh lifetime (config.auth.refreshTokenTtlSeconds).
   */
  retentionMs: number;
  intervalMs?: number;
  now?: () => Date;
  /** Injectable so a test can drive the ticks itself. */
  setInterval?: typeof globalThis.setInterval;
}

/**
 * One sweep. Says how many rows went, and only when some did — a daily line
 * reading `deleted=0` is noise in a log meant to be grepped.
 */
export async function cleanupRefreshTokens(pool: Pool, options: CleanupOptions): Promise<number> {
  const now = (options.now ?? (() => new Date()))();
  const deleted = await deleteStaleRefreshTokens(
    pool,
    now,
    new Date(now.getTime() - options.retentionMs),
  );
  if (deleted > 0) logEvent('info', 'AUTH_TOKENS_CLEANED', { deleted });
  return deleted;
}

/**
 * Starts the sweep: once right away, then daily. `unref()` keeps the timer from
 * holding the process open, and every run is wrapped — housekeeping must never
 * be able to take the server down, and the next tick tries again anyway.
 */
export function startRefreshTokenCleanup(
  pool: Pool,
  options: CleanupOptions,
): { stop: () => void } {
  const run = (): void => {
    void cleanupRefreshTokens(pool, options).catch((error: unknown) => {
      logEvent('error', 'AUTH_TOKEN_CLEANUP_FAILED', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  run();
  const timer = (options.setInterval ?? setInterval)(
    run,
    options.intervalMs ?? CLEANUP_INTERVAL_MS,
  );
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
