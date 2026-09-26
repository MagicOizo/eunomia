import { describe, expect, it } from 'vitest';

import { accountInForce, accountPeriod } from './accounts';

/**
 * The same cases as apps/api/src/domain/agency-accounts.test.ts: both sides
 * resolve an agency's account by the day the money moved, and they have to
 * agree.
 */

const undated = { agencyAccountUID: 'g1', validFrom: null, bankAccount: 'DE00' };
const from2024 = { agencyAccountUID: 'g2', validFrom: '2024-03-01', bankAccount: 'DE24' };
const from2026 = { agencyAccountUID: 'g3', validFrom: '2026-01-01', bankAccount: 'DE26' };
/** As the API hands them out: oldest first, the undated entry in front. */
const history = [undated, from2024, from2026];

describe('accountInForce', () => {
  it('takes the newest account that had already started', () => {
    expect(accountInForce(history, '2026-06-30')?.bankAccount).toBe('DE26');
    expect(accountInForce(history, '2025-12-31')?.bankAccount).toBe('DE24');
  });

  it('counts the day itself as started', () => {
    expect(accountInForce(history, '2024-03-01')?.bankAccount).toBe('DE24');
    expect(accountInForce(history, '2024-02-29')?.bankAccount).toBe('DE00');
  });

  it('lets an undated account apply to every date before the first change', () => {
    expect(accountInForce(history, '1999-01-01')?.bankAccount).toBe('DE00');
  });

  it('has no account for a date before the first one, when none is undated', () => {
    expect(accountInForce([from2024, from2026], '2020-01-01')).toBeNull();
  });

  it('resolves to today without a date, ignoring an account that starts later', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future = { agencyAccountUID: 'g4', validFrom: tomorrow, bankAccount: 'DEXX' };
    expect(accountInForce([...history, future])?.bankAccount).toBe('DE26');
  });

  it('returns null for an agency without any account', () => {
    expect(accountInForce([], '2026-06-30')).toBeNull();
  });
});

describe('accountPeriod', () => {
  it('names the period the way the history block reads it', () => {
    expect(accountPeriod({ validFrom: null, validTo: null })).toBe('immer gültig');
    expect(accountPeriod({ validFrom: null, validTo: '2025-12-31' })).toBe('bis 31.12.2025');
    expect(accountPeriod({ validFrom: '2026-01-01', validTo: null })).toBe('ab 01.01.2026');
    expect(accountPeriod({ validFrom: '2024-03-01', validTo: '2025-12-31' })).toBe(
      '01.03.2024 – 31.12.2025',
    );
  });
});
