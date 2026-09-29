import { describe, expect, it } from 'vitest';

import { accountForInvoice, accountHint, accountLabel, defaultAccount } from './accounts';

/**
 * The suggestion rule of Slice 44. Its twin lives in
 * apps/api/src/domain/agency-accounts.test.ts — the create form, the display
 * mask and the reminder mail must name the same account.
 */

const first = { agencyAccountUID: 'g1', bankAccount: 'DE00' };
const second = { agencyAccountUID: 'g2', bankAccount: 'DE24' };
/** As the API hands them out: in the order they were recorded. */
const accounts = [first, second];

describe('defaultAccount', () => {
  it('suggests the account recorded first', () => {
    expect(defaultAccount(accounts)?.bankAccount).toBe('DE00');
  });

  it('has nothing to suggest for an agency without accounts', () => {
    expect(defaultAccount([])).toBeNull();
  });
});

describe('accountForInvoice', () => {
  it('takes the account the invoice names', () => {
    expect(accountForInvoice(accounts, 'g2')?.bankAccount).toBe('DE24');
  });

  it('falls back to the first while the invoice names none', () => {
    expect(accountForInvoice(accounts, null)?.bankAccount).toBe('DE00');
  });

  it('falls back as well when the named account is not in the list', () => {
    // A deleted account, for instance: it is in the trash, not in the list.
    expect(accountForInvoice(accounts, 'g9')?.bankAccount).toBe('DE00');
  });
});

describe('accountHint', () => {
  it('names beneficiary and note, what tells two IBANs apart', () => {
    expect(accountHint({ recipientName: 'Zahlstelle', note: 'Radiologie' })).toBe(
      'Zahlstelle · Radiologie',
    );
    expect(accountHint({ recipientName: null, note: 'Radiologie' })).toBe('Radiologie');
  });

  it('stays undefined where there is nothing to add', () => {
    expect(accountHint({ recipientName: null, note: null })).toBeUndefined();
  });
});

describe('accountLabel', () => {
  it('prints the IBAN in groups of four, the form it is read in', () => {
    expect(accountLabel({ bankAccount: 'DE89370400440532013000' })).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });
});
