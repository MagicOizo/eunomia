import { describe, expect, it } from 'vitest';

import { invoicePaymentDetail, paymentDetailHint, paymentDetailLabel } from './payment-details';

/**
 * Picking a set out and writing it down (Slice 44). Which one is suggested is
 * the shared rule and is tested with it (packages/shared, payment-details.test.ts).
 */

const first = { agencyAccountUID: 'g1', bankAccount: 'DE00' };
const second = { agencyAccountUID: 'g2', bankAccount: 'DE24' };
/** As the API hands them out: in the order they were recorded. */
const details = [first, second];

describe('invoicePaymentDetail', () => {
  it('takes the details the invoice names', () => {
    expect(invoicePaymentDetail(details, 'g2')?.bankAccount).toBe('DE24');
  });

  it('falls back to the first while the invoice names none', () => {
    expect(invoicePaymentDetail(details, null)?.bankAccount).toBe('DE00');
  });

  it('falls back as well when the named set is not in the list', () => {
    // A deleted set, for instance: it is in the trash, not in the list.
    expect(invoicePaymentDetail(details, 'g9')?.bankAccount).toBe('DE00');
  });
});

describe('paymentDetailHint', () => {
  it('names beneficiary and note, what tells two IBANs apart', () => {
    expect(paymentDetailHint({ recipientName: 'Zahlstelle', note: 'Radiologie' })).toBe(
      'Zahlstelle · Radiologie',
    );
    expect(paymentDetailHint({ recipientName: null, note: 'Radiologie' })).toBe('Radiologie');
  });

  it('stays undefined where there is nothing to add', () => {
    expect(paymentDetailHint({ recipientName: null, note: null })).toBeUndefined();
  });
});

describe('paymentDetailLabel', () => {
  it('prints the IBAN in groups of four, the form it is read in', () => {
    expect(paymentDetailLabel({ bankAccount: 'DE89370400440532013000' })).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });
});
