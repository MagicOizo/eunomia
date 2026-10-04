/**
 * Catches what `lib/log.ts` writes while something runs, so a test can assert
 * on the event lines instead of only on the answer. It also keeps the test
 * output readable — without it every captured line would still be printed.
 *
 * It stood as a local function in `mail/mailer.test.ts`, which was the only
 * place that checked a log line at all. The audit trail (SEC-09) gives it four
 * more callers, and a second copy of a function that reassigns `console` is
 * exactly the kind of duplicate that ends up differing.
 */

/** One captured run: whatever it answered, plus the lines it logged. */
export interface Captured<T> {
  result: T;
  lines: string[];
}

/** Runs `run` with console captured, and restores console whatever happens. */
export function captureLog<T>(run: () => Promise<T>): Promise<Captured<T>> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const collect =
    () =>
    (...args: unknown[]): void => {
      lines.push(args.map(String).join(' '));
    };
  console.log = collect();
  console.warn = collect();
  console.error = collect();
  return run()
    .then((result) => ({ result, lines }))
    .finally(() => {
      Object.assign(console, original);
    });
}

/**
 * The captured lines for one event, in order. Matching on the full
 * `eunomia event=NAME ` prefix rather than on the bare name, so a test for
 * `USER_UPDATED` cannot be satisfied by a line that merely mentions it.
 */
export function eventLines(lines: string[], event: string): string[] {
  return lines.filter((line) => line.startsWith(`eunomia event=${event} `));
}

/** The one line for an event; fails the caller's assertion if there is not exactly one. */
export function singleEvent(lines: string[], event: string): string | undefined {
  const found = eventLines(lines, event);
  return found.length === 1 ? found[0] : undefined;
}
