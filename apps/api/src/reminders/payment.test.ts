import assert from 'node:assert/strict';
import test from 'node:test';

import { DUE_SOON_DAYS, calcPaymentState, daysUntil } from './payment.js';

const TODAY = '2026-09-24';

/** An unpaid invoice with the given due date. */
function invoice(transferUntilDate: string | null, overrides = {}) {
  return { transferDate: null, transferUntilDate, directPayment: 0, ...overrides };
}

test('the threshold matches the traffic light in the invoice list', () => {
  // Pinned on both sides — apps/web/src/invoices/payment.spec.ts has the twin.
  assert.equal(DUE_SOON_DAYS, 10);
});

test('a transferred or cash-paid invoice is done', () => {
  assert.equal(
    calcPaymentState(invoice('2026-09-01', { transferDate: '2026-09-02' }), TODAY),
    'paid',
  );
  assert.equal(calcPaymentState(invoice('2026-09-01', { directPayment: 1 }), TODAY), 'paid');
});

test('the due date decides between uncritical, due and overdue', () => {
  assert.equal(calcPaymentState(invoice('2026-09-23'), TODAY), 'overdue');
  assert.equal(calcPaymentState(invoice('2026-09-24'), TODAY), 'due');
  // The last day inside the window, and the first one outside it.
  assert.equal(calcPaymentState(invoice('2026-10-03'), TODAY), 'due');
  assert.equal(calcPaymentState(invoice('2026-10-04'), TODAY), 'uncritical');
});

test('an invoice without a due date counts as due rather than being ignored', () => {
  assert.equal(calcPaymentState(invoice(null), TODAY), 'due');
});

test('day arithmetic crosses month, year and daylight-saving boundaries', () => {
  assert.equal(daysUntil('2026-10-01', '2026-09-24'), 7);
  assert.equal(daysUntil('2026-09-24', '2026-10-01'), -7);
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1);
  // Europe/Berlin switches on 2026-10-25; calendar days do not care.
  assert.equal(daysUntil('2026-10-26', '2026-10-24'), 2);
});
