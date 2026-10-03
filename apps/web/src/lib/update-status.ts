import { computed, ref } from 'vue';

import { apiData } from './api';

/**
 * Whether a newer release is published — one answer for the whole app.
 *
 * Two places show it: the footer's notice and the update card in the system
 * settings, where a button asks GitHub again on the spot. Each of them used to
 * keep its own copy, so the manual check reached the card and left the footer on
 * the state of the last page load (issues.md 0.13.0-6). The state therefore
 * lives here, in the module, and both read the same ref: what one of them
 * learns, the other shows in the same moment.
 *
 * The sibling of lib/app-info.ts, which shares the version between the footer
 * and the browser title — reactive rather than only memoised, because this
 * answer changes while the page is open.
 */

/** Mirrors the API's UpdateStatus (apps/api/src/lib/update-check.ts). */
export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string | null;
  status: 'ok' | 'disabled' | 'unavailable';
  reason?:
    'no_token_private' | 'not_found' | 'network' | 'rate_limited' | 'unauthorized' | 'no_release';
}

const status = ref<UpdateStatus | null>(null);

/** Null until the first successful answer: nothing is known, so nothing is shown. */
export const updateStatus = computed(() => status.value);

/** The GET in flight, shared by concurrent callers (the API caches too). */
let pending: Promise<UpdateStatus> | null = null;

/**
 * Counts the sessions this state has seen, so an answer that arrives after a
 * `clearUpdateStatus()` is dropped instead of reviving what that call ended.
 */
let epoch = 0;

/** Stores an answer unless the session it was asked for has meanwhile ended. */
function store(result: UpdateStatus, askedAt: number): UpdateStatus {
  if (askedAt === epoch) status.value = result;
  return result;
}

/**
 * Reads the status, at most one request at a time. A `status` of `unavailable`
 * is an answer like any other and is stored; a request that fails outright
 * throws and leaves the last answer standing, for the caller to report (the
 * settings page names the cause, the footer stays silent).
 */
export function loadUpdateStatus(): Promise<UpdateStatus> {
  const askedAt = epoch;
  pending ??= apiData<UpdateStatus>('/update-check')
    .then((result) => store(result, askedAt))
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * Asks GitHub now instead of reusing its cached answer — the "check now" button
 * in the system settings. Never shares an in-flight read: asking now is the
 * whole point.
 */
export async function refreshUpdateStatus(): Promise<UpdateStatus> {
  const askedAt = epoch;
  const result = await apiData<UpdateStatus>('/update-check/refresh', { method: 'POST' });
  return store(result, askedAt);
}

/**
 * Forgets everything that is known. Called when an admin session ends, so the
 * notice cannot outlive it in the same tab, and by the tests, which have to
 * start from an unasked state.
 */
export function clearUpdateStatus(): void {
  epoch += 1;
  pending = null;
  status.value = null;
}
