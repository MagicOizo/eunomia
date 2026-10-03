import { describe, expect, it } from 'vitest';

import { PAYMENT_COLOR_VAR, PAYMENT_DISPLAY, paymentState } from './payment';

/**
 * The rule itself is tested in the shared package (payment-state.test.ts); what
 * is web-side is the day the browser counts as today and the two display tables.
 */

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

/** A due date `days` from today, as the local calendar day, formatted YYYY-MM-DD. */
function dueIn(days: number): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

describe('paymentState', () => {
  it('reads the due date against the reader’s own calendar day', () => {
    // Not the UTC day: in Berlin these two differ until 2 a.m., and the light
    // would stand on red a day early.
    expect(paymentState(invoice({ transferUntilDate: dueIn(0) }))).toBe('due');
    expect(paymentState(invoice({ transferUntilDate: dueIn(-1) }))).toBe('overdue');
    expect(paymentState(invoice({ transferUntilDate: dueIn(45) }))).toBe('uncritical');
  });

  it('is "paid" once the invoice has been transferred or settled in cash', () => {
    expect(paymentState(invoice({ transferDate: dueIn(-5), transferUntilDate: dueIn(-5) }))).toBe(
      'paid',
    );
    expect(paymentState(invoice({ directPayment: true, transferUntilDate: dueIn(-30) }))).toBe(
      'paid',
    );
  });

  it('is "due" when unpaid with no due date recorded (never silently ignored)', () => {
    expect(paymentState(invoice({ transferUntilDate: null }))).toBe('due');
  });
});

describe('the display tables', () => {
  it('cover every state, so no light is drawn without icon or colour', () => {
    for (const state of ['paid', 'uncritical', 'due', 'overdue'] as const) {
      expect(PAYMENT_DISPLAY[state].label).not.toBe('');
      expect(PAYMENT_COLOR_VAR[state]).toMatch(/^--eu-color-/);
    }
  });
});
