/**
 * Waiting for a condition instead of for a fixed number of ticks.
 *
 * Why this exists: `await flushPromises()` empties the queues as they stand,
 * but a component may schedule more work from inside that flush. `EuDialog`
 * does exactly that — `sync()` runs on `onMounted` and then defers a `focus()`
 * into the dialog body with `nextTick`, so a dialog mounted with `open: true`
 * is still settling when `mount()` plus one flush has returned. A test that
 * reads the DOM at that moment is racing it, and loses about once in a hundred
 * runs on a loaded machine — which is how `SubmitDialog.a11y.test.ts` and
 * `InvoicePickerView.test.ts` came to flicker (issues.md 0.19.0-2).
 *
 * Counting ticks until it goes green would only move the race. These wait for
 * the thing itself.
 */

import { flushPromises } from '@vue/test-utils';

/** Flushes often enough for work that schedules more work, then gives up. */
const ATTEMPTS = 50;

/**
 * Flushes until `ready()` holds, then returns. Throws naming `what` if it never
 * does — a timeout has to say what it was waiting for, or it is just a slower
 * version of the same confusing failure.
 */
export async function settled(ready: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (ready()) return;
    await flushPromises();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/**
 * The same for a value: flushes until `read()` returns something other than
 * undefined or null, and hands it back.
 */
export async function settledValue<T>(read: () => T | null | undefined, what: string): Promise<T> {
  let value: T | null | undefined;
  await settled(() => {
    value = read();
    return value !== undefined && value !== null;
  }, what);
  return value as T;
}
