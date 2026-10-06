import { ERROR_CODES, type RetentionKind } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { expiredDeletedUsers, hardDeleteUser } from '../auth/admin-repository.js';
import { purgeEntry } from '../domain/trash-purge.js';
import { TRASH_ENTITIES } from '../domain/trash-registry.js';
import { blockers, loadExpired, loadOne } from '../domain/trash-tree.js';
import { ApiError } from '../lib/api-error.js';
import {
  SYSTEM_ACTOR,
  auditRetentionSwept,
  auditTrashPurged,
  auditUserPurged,
} from '../lib/audit.js';
import { logEvent } from '../lib/log.js';
import { type EncryptionKey, getSettings, setApplicationValues } from '../settings/repository.js';
import type { SettingKey, SettingValue } from '../settings/registry.js';

/**
 * The retention period (Sicherheits-Review, SEC-15). The Papierkorb held
 * deleted records for ever and only a hand ever emptied it, so nothing in the
 * app ever made health data disappear. After the configured number of days a
 * deleted record goes for good, and with it a user that was deleted longer ago
 * than that.
 *
 * Three decisions carry the module:
 *
 *  - **It deletes nothing a hand could not.** The sweep calls the same
 *    `purgeEntry` the trash's own button calls (domain/trash-purge.ts), so the
 *    rules are not written twice: what hangs below a record and is itself
 *    deleted goes with it, and a record something ACTIVE still points at is
 *    not removed at all — it is counted and tried again at the next sweep.
 *  - **Only the trash and deleted users age.** Active data has no period here;
 *    that would be a decision about case data, and SEC-15 does not ask for one
 *    (see Notes/eunomia-plan.md §2.11).
 *  - **A deletion without a recorded moment never ages.** Rows deleted before
 *    Slice 39 (and users deleted before migration 018) carry no `deletedAt`;
 *    they stay until a hand removes them, because a period must not delete on
 *    the strength of a moment nobody wrote down.
 *
 * There is no hour to configure, unlike the reminders: a DELETE does not care
 * what time it is, while a mail arrives at a person (the same reasoning as in
 * auth/cleanup.ts). The timer runs once at start and then daily.
 */

/** How often the sweep runs. The unit of the period is a day, so this is one. */
export const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What a sweep did, per kind of record — numbers only, never a label. */
export interface SweptKind {
  /** The registry key of the entity (`invoice`, `contract`, …), or `user`. */
  kind: RetentionKind;
  purged: number;
  /** Still held by something active; the next sweep tries again. */
  skipped: number;
}

export interface SweepResult {
  /** When the sweep ran, as an ISO instant (like the reminder run). */
  ranAt: string;
  /** The configured period, in days. */
  days: number;
  /** Everything deleted before this moment was due, as an ISO instant. */
  cutoff: string;
  /** Expired trash entries removed for good. What went along with one is in its audit line. */
  purged: number;
  users: number;
  skipped: number;
  byKind: SweptKind[];
  dryRun: boolean;
}

export interface SweepOptions {
  encryptionKey: EncryptionKey;
  now?: () => Date;
  /** Counts and reports without removing anything, and writes no status. */
  dryRun?: boolean;
}

export interface RetentionSettings {
  enabled: boolean;
  trashDays: number;
}

/** The period as configured; the sweep and the settings page read it the same way. */
export async function readRetentionSettings(
  pool: Pool,
  encryptionKey: EncryptionKey,
): Promise<RetentionSettings> {
  const settings = await getSettings(pool, encryptionKey);
  return {
    enabled: settings['retention.enabled'],
    trashDays: settings['retention.trashDays'],
  };
}

/** Whether the error is the trash's "something active still points at it". */
function stillReferenced(error: unknown): boolean {
  return error instanceof ApiError && error.code === ERROR_CODES.STILL_REFERENCED;
}

/**
 * One sweep. Returns what it did (or, for a dry run, what it would do) and
 * writes the status settings the page shows.
 *
 * The kinds are walked in **reverse registry order** — the workflow records
 * before the master data they hang on — so a child is gone before its parent is
 * tried and the parent is blocked as rarely as possible. Within a kind the
 * oldest deletion goes first.
 */
export async function sweepRetention(pool: Pool, options: SweepOptions): Promise<SweepResult> {
  const now = (options.now ?? (() => new Date()))();
  const dryRun = options.dryRun === true;
  const { trashDays } = await readRetentionSettings(pool, options.encryptionKey);
  const cutoff = new Date(now.getTime() - trashDays * 24 * 60 * 60 * 1000);

  const byKind: SweptKind[] = [];
  let purged = 0;
  let skipped = 0;

  for (const entity of [...TRASH_ENTITIES].reverse()) {
    const expired = await loadExpired(pool, entity, cutoff);
    if (expired.length === 0) continue;
    let kindPurged = 0;
    let kindSkipped = 0;

    for (const candidate of expired) {
      if (dryRun) {
        if ((await blockers(pool, candidate)).length > 0) kindSkipped += 1;
        else kindPurged += 1;
        continue;
      }
      // An earlier purge of this very sweep may have taken the record along as
      // a child of its own parent; then there is nothing left to do here.
      const still = await loadOne(pool, entity, candidate.uid);
      if (!still) continue;
      try {
        const alsoRemoved = await purgeEntry(pool, still);
        kindPurged += 1;
        auditTrashPurged({
          actor: SYSTEM_ACTOR,
          kind: entity.key,
          uid: still.uid,
          alsoRemoved,
        });
      } catch (error) {
        // Anything else is a real failure and ends the sweep: the next tick
        // retries, and the status says what happened.
        if (!stillReferenced(error)) throw error;
        kindSkipped += 1;
      }
    }

    purged += kindPurged;
    skipped += kindSkipped;
    byKind.push({ kind: entity.key, purged: kindPurged, skipped: kindSkipped });
  }

  const dueUsers = await expiredDeletedUsers(pool, cutoff);
  let users = 0;
  for (const uuid of dueUsers) {
    if (dryRun) {
      users += 1;
      continue;
    }
    if ((await hardDeleteUser(pool, uuid)) === 0) continue;
    users += 1;
    auditUserPurged({ actor: SYSTEM_ACTOR, user: uuid });
  }
  if (dueUsers.length > 0) {
    byKind.push({ kind: 'user', purged: users, skipped: 0 });
  }

  const result: SweepResult = {
    ranAt: now.toISOString(),
    days: trashDays,
    cutoff: cutoff.toISOString(),
    purged,
    users,
    skipped,
    byKind,
    dryRun,
  };

  if (!dryRun) {
    // Only when something actually went. A sweep that merely skipped the same
    // held-back entry again would write the same line every day for ever, and
    // bury the ones that mean something.
    if (purged > 0 || users > 0) {
      auditRetentionSwept({ days: trashDays, purged, users, skipped });
    }
    await writeStatus(pool, result.ranAt, 'ok', null, purged + users);
  }
  return result;
}

/**
 * The status of the last sweep, for the settings page. Through
 * `setApplicationValues`, which bypasses the readonly guard the API applies to
 * client writes — as with the mail and reminder status, the component that does
 * the work is the one allowed to report on it.
 */
async function writeStatus(
  pool: Pool,
  at: string,
  result: 'ok' | 'error',
  error: string | null,
  removed: number | null,
): Promise<void> {
  await setApplicationValues(
    pool,
    new Map<SettingKey, SettingValue>([
      ['retention.lastRunAt', at],
      ['retention.lastRunResult', result],
      ['retention.lastRunError', error],
      ['retention.lastRunPurged', removed],
    ]),
  );
}

export interface SweepSchedulerOptions extends SweepOptions {
  intervalMs?: number;
  /** Injectable so a test can drive the ticks itself. */
  setInterval?: typeof globalThis.setInterval;
}

/**
 * Starts the sweep: once right away, then daily. `unref()` keeps the timer from
 * holding the process open, and every run is wrapped — housekeeping must never
 * be able to take the server down, and the next tick tries again anyway.
 *
 * While the period is switched off the tick reads the settings and returns, so
 * switching it on needs no restart.
 */
export function startRetentionSweep(
  pool: Pool,
  options: SweepSchedulerOptions,
): { stop: () => void } {
  const run = (): void => {
    void (async () => {
      const { enabled } = await readRetentionSettings(pool, options.encryptionKey);
      if (!enabled) return;
      await sweepRetention(pool, options);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logEvent('error', 'RETENTION_SWEEP_FAILED', { message });
      // The failure belongs on the settings page too, not only in the log: a
      // period that has silently stopped working looks exactly like one that
      // has nothing to do.
      void writeStatus(pool, new Date().toISOString(), 'error', message, null).catch(() => {});
    });
  };

  run();
  const timer = (options.setInterval ?? setInterval)(run, options.intervalMs ?? SWEEP_INTERVAL_MS);
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
