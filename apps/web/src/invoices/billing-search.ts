import type { BillingListDto } from './api';
import { MIN_QUERY_LENGTH } from './invoice-search';

/**
 * The filter of the billing search across every policy (issues.md 0.15.0-5):
 * what is asked for, how it reads in the URL, and what was asked last.
 *
 * The counterpart of invoice-search.ts, and deliberately smaller (owner's
 * decision, 05.10.2026): one free text — the API reads it as billing number,
 * policy number, person or invoice number — and the one question the point
 * names, "which billings have nothing booked on them yet?". Dates and amounts
 * stay on the page of the policy, where the list is short enough for them.
 */

export interface BillingFilter {
  /** Free text; below MIN_QUERY_LENGTH it asks nothing, as on the invoice search. */
  q: string;
  /** Only billings without any reimbursement booked on them. */
  unlinked: boolean;
}

export const EMPTY_BILLING_FILTER: BillingFilter = { q: '', unlinked: false };

/**
 * Whether the filter asks anything, i.e. whether a result list is shown. The
 * switch alone is a question: it is the list of letters still waiting for
 * their invoices, across every policy.
 */
export function isActive(filter: BillingFilter): boolean {
  return filter.q.trim().length >= MIN_QUERY_LENGTH || filter.unlinked;
}

/** One query value as a plain string; a repeated parameter yields an array. */
function one(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

/** The filter a URL asks for; anything unreadable falls back to "not set". */
export function filterFromQuery(query: Record<string, unknown>): BillingFilter {
  return { q: one(query.q), unlinked: one(query.unlinked) === '1' };
}

/** The URL query for a filter: only what is set, so a bare page stays a bare URL. */
export function queryFromFilter(filter: BillingFilter): Record<string, string> {
  const result: Record<string, string> = {};
  const q = filter.q.trim();
  if (q !== '') result.q = q;
  if (filter.unlinked) result.unlinked = '1';
  return result;
}

/**
 * The same filter as the API reads it. A text too short to ask anything does
 * not narrow the switch's list either — it is not sent.
 */
export function apiQueryFromFilter(filter: BillingFilter): { q?: string; unlinked: boolean } {
  const q = filter.q.trim();
  return q.length >= MIN_QUERY_LENGTH
    ? { q, unlinked: filter.unlinked }
    : { unlinked: filter.unlinked };
}

/**
 * The filter last asked for, for the way back: the policy page's back arrow and
 * the menu both lead to a bare `/billings`. Module state on purpose, as on the
 * invoice search — it belongs to the session, not to the browser.
 */
let remembered: BillingFilter = { ...EMPTY_BILLING_FILTER };

export function rememberFilter(filter: BillingFilter): void {
  remembered = { ...filter };
}

export function rememberedFilter(): BillingFilter {
  return { ...remembered };
}

/** The policy page a hit lives on, with its row marked. */
export function hitTarget(billing: Pick<BillingListDto, 'billingUID' | 'contractUID'>): string {
  return `/billings/${billing.contractUID}?billing=${billing.billingUID}`;
}
