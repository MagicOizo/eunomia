import { describe, expect, it } from 'vitest';

import { DUE_SOON_DAYS, calcPaymentState } from './payment';

/** Minimal invoice shape the traffic light cares about. */
function invoice(overrides: {
  transferDate?: string | null;
  transferUntilDate?: string | null;
  directPayment?: boolean;
}): { transferDate: string | null; transferUntilDate: string | null; directPayment: boolean } {
  return {
    transferDate: null,
    transferUntilDate: null,
    directPayment: false,
    ...overrides,
  };
}

const today = new Date(2026, 5, 15); // 2026-06-15, local time

/** A due date `days` from `today`, formatted YYYY-MM-DD. */
function dueIn(days: number): string {
  const d = new Date(2026, 5, 15 + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('calcPaymentState', () => {
  it('is "paid" once the invoice has been transferred', () => {
    expect(
      calcPaymentState(
        invoice({ transferDate: '2026-06-10', transferUntilDate: dueIn(-5) }),
        today,
      ),
    ).toBe('paid');
  });

  it('is "paid" for direct/cash payment even without a transfer date', () => {
    expect(
      calcPaymentState(invoice({ directPayment: true, transferUntilDate: dueIn(-30) }), today),
    ).toBe('paid');
  });

  it('is "overdue" when unpaid and the due date has passed', () => {
    expect(calcPaymentState(invoice({ transferUntilDate: dueIn(-1) }), today)).toBe('overdue');
  });

  it('is "due" when unpaid and the due date is today (0 days)', () => {
    expect(calcPaymentState(invoice({ transferUntilDate: dueIn(0) }), today)).toBe('due');
  });

  it(`is "due" up to the day before the ${DUE_SOON_DAYS}-day threshold`, () => {
    expect(calcPaymentState(invoice({ transferUntilDate: dueIn(DUE_SOON_DAYS - 1) }), today)).toBe(
      'due',
    );
  });

  it(`is "uncritical" exactly at the ${DUE_SOON_DAYS}-day threshold`, () => {
    expect(calcPaymentState(invoice({ transferUntilDate: dueIn(DUE_SOON_DAYS) }), today)).toBe(
      'uncritical',
    );
  });

  it('is "uncritical" when the due date is comfortably ahead', () => {
    expect(calcPaymentState(invoice({ transferUntilDate: dueIn(45) }), today)).toBe('uncritical');
  });

  it('is "due" when unpaid with no due date recorded (never silently ignored)', () => {
    expect(calcPaymentState(invoice({ transferUntilDate: null }), today)).toBe('due');
  });
});
