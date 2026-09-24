import { logEvent } from '../lib/log.js';

/**
 * When the daily reminder run is due (see Notes/eunomia-plan.md, Slice 31).
 *
 * This is the first piece of the backend that acts without an incoming request.
 * It is deliberately small: a ticking interval that asks a pure function
 * whether the run is due, and a watermark in the settings (`reminders.lastRunAt`)
 * that survives a restart. No cron expression, no job table — the whole
 * schedule is "once a day at a given hour".
 */

/** How often the timer wakes up to ask. Finer than any schedule it serves. */
export const TICK_MS = 5 * 60 * 1000;

/** The formatter cache; building one per tick would be wasteful and pointless. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedNow {
  /** The calendar day in that zone, as `YYYY-MM-DD`. */
  date: string;
  /** The hour of day in that zone, 0–23. */
  hour: number;
}

/**
 * The wall-clock day and hour at `now` in `timeZone`. Uses Intl rather than a
 * date library: the zone database ships with the runtime, and this is the only
 * zone arithmetic in the project.
 *
 * An unknown zone would make Intl throw and, in the scheduler, silently stop
 * every run — so it falls back to UTC and says so in the log. The settings API
 * rejects an unknown zone on write (settings/registry.ts); this covers a value
 * that a runtime update stopped knowing.
 */
export function zonedNow(now: Date, timeZone: string): ZonedNow {
  let parts;
  try {
    parts = formatterFor(timeZone).formatToParts(now);
  } catch {
    logEvent('warn', 'REMINDERS_TIMEZONE_UNKNOWN', { timeZone, fallback: 'UTC' });
    parts = formatterFor('UTC').formatToParts(now);
  }
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  // en-CA gives ISO-shaped numbers, and hour12:false renders midnight as '24'
  // in some runtimes — that is hour 0 of the same day.
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

/**
 * Whether today's run still has to happen: the configured hour has arrived in
 * the configured zone, and the last run was on an earlier day.
 *
 * Comparing whole days rather than "24 hours since the last run" keeps the run
 * at its hour after a restart or a clock change, and makes a missed window
 * (the machine was off at 7:00) catch up at the next tick instead of waiting
 * for tomorrow.
 */
export function isRunDue(
  now: Date,
  lastRunAt: string | null,
  hour: number,
  timeZone: string,
): boolean {
  const here = zonedNow(now, timeZone);
  if (here.hour < hour) return false;
  if (lastRunAt === null) return true;

  const lastRun = new Date(lastRunAt);
  if (Number.isNaN(lastRun.getTime())) return true;
  return zonedNow(lastRun, timeZone).date < here.date;
}

export interface SchedulerDeps {
  now?: () => Date;
  /** Injectable so a test can drive the ticks itself. */
  setInterval?: typeof globalThis.setInterval;
}

/** What the scheduler needs to know and to trigger. */
export interface SchedulerTarget {
  readSchedule(): Promise<{
    enabled: boolean;
    hour: number;
    timeZone: string;
    lastRunAt: string | null;
  }>;
  run(): Promise<unknown>;
}

/**
 * Starts the ticking timer. `unref()` keeps it from holding the process open,
 * and every tick is wrapped: a failing run must never take the server down,
 * and the next tick tries again.
 */
export function startReminderScheduler(
  target: SchedulerTarget,
  deps: SchedulerDeps = {},
): { stop: () => void } {
  const now = deps.now ?? (() => new Date());
  const timer = (deps.setInterval ?? setInterval)(() => {
    void (async () => {
      try {
        const schedule = await target.readSchedule();
        if (!schedule.enabled) return;
        if (!isRunDue(now(), schedule.lastRunAt, schedule.hour, schedule.timeZone)) return;
        await target.run();
      } catch (error) {
        logEvent('error', 'REMINDERS_TICK_FAILED', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, TICK_MS);
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
