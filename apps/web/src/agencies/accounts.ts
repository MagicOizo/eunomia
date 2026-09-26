import { germanDate } from '../lib/format';
import type { AgencyAccountDto } from './api';

/**
 * Which bank account of a collection agency applies, and how to say so.
 *
 * A `validFrom` of null means "applies from the beginning": the account
 * recorded first carries no date, only a later change does (see
 * Notes/eunomia-plan.md, Slice 38). The resolution below is the twin of
 * `accountInForce` in apps/api/src/domain/agency-accounts.ts — the mail about an
 * invoice and the invoice itself must name the same account, so change one and
 * change the other.
 */

/** Today as `YYYY-MM-DD` in the browser's zone. */
function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The account in force on `date`: the newest entry that had already started, an
 * undated one counting as "started long ago". `date` is the day the money moved
 * (the invoice's `transferDate`); null means today, which is what an unpaid
 * invoice is about. Null only when the agency has no account at all.
 */
export function accountInForce<T extends { validFrom: string | null }>(
  accounts: T[],
  date: string | null = null,
): T | null {
  const on = date ?? today();
  let best: T | null = null;
  for (const account of accounts) {
    if (account.validFrom !== null && account.validFrom > on) continue;
    // An undated entry loses against any dated one that has started.
    if (best === null || (account.validFrom ?? '') >= (best.validFrom ?? '')) best = account;
  }
  return best;
}

/**
 * The period an account covers, as the history block shows it. An undated entry
 * has no start to name — it is simply the one that came before the first
 * change, or, while it is the only one, the one that always applies.
 */
export function accountPeriod(account: Pick<AgencyAccountDto, 'validFrom' | 'validTo'>): string {
  if (account.validFrom === null) {
    return account.validTo === null ? 'immer gültig' : `bis ${germanDate(account.validTo)}`;
  }
  return account.validTo === null
    ? `ab ${germanDate(account.validFrom)}`
    : `${germanDate(account.validFrom)} – ${germanDate(account.validTo)}`;
}
