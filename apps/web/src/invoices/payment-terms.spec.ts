import { describe, expect, it } from 'vitest';

import { PAYMENT_TERM_DAYS, paymentTermSuggestions } from './payment-terms';

describe('paymentTermSuggestions', () => {
  it('offers the four steps a bill usually names, counted from the invoice date', () => {
    expect(paymentTermSuggestions('2020-03-01')).toEqual([
      { value: '2020-03-01', label: 'sofort', hint: '01.03.2020' },
      { value: '2020-03-15', label: '14 Tage', hint: '15.03.2020' },
      { value: '2020-03-16', label: '15 Tage', hint: '16.03.2020' },
      { value: '2020-03-31', label: '30 Tage', hint: '31.03.2020' },
    ]);
  });

  it('names the invoice date itself "sofort" rather than "0 Tage"', () => {
    const [first] = paymentTermSuggestions('2026-09-24');

    expect(first.label).toBe('sofort');
    expect(first.value).toBe('2026-09-24');
  });

  it('carries over the end of a month, a year and a leap February', () => {
    expect(paymentTermSuggestions('2026-12-20').map((s) => s.value)).toEqual([
      '2026-12-20',
      '2027-01-03',
      '2027-01-04',
      '2027-01-19',
    ]);
    expect(paymentTermSuggestions('2024-02-20').map((s) => s.value)).toEqual([
      '2024-02-20',
      '2024-03-05',
      '2024-03-06',
      '2024-03-21',
    ]);
  });

  it('suggests nothing while there is no invoice date to count from', () => {
    // A date field runs through half-typed values on its way to a full one.
    for (const invoiceDate of ['', '   ', '2026-09', '2026-02-31', 'morgen']) {
      expect(paymentTermSuggestions(invoiceDate)).toEqual([]);
    }
  });

  it('keeps the steps and their order in one place', () => {
    expect(PAYMENT_TERM_DAYS).toEqual([0, 14, 15, 30]);
    expect(paymentTermSuggestions('2020-03-01')).toHaveLength(PAYMENT_TERM_DAYS.length);
  });
});
