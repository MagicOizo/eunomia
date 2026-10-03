import assert from 'node:assert/strict';
import test from 'node:test';

import { DUE_SOON_DAYS, calcPaymentState, daysUntil } from './payment-state.js';

const TODAY = '2026-09-24';

/** An unpaid invoice with the given due date. */
function invoice(transferUntilDate: string | null, overrides = {}) {
  return { transferDate: null, transferUntilDate, directPayment: false, ...overrides };
}

test('the threshold is the one both the reminders and the traffic light use', () => {
  assert.equal(DUE_SOON_DAYS, 10);
});

test('a transferred or cash-paid invoice is done', () => {
  assert.equal(
    calcPaymentState(invoice('2026-09-01', { transferDate: '2026-09-02' }), TODAY),
    'paid',
  );
  assert.equal(calcPaymentState(invoice('2026-09-01', { directPayment: true }), TODAY), 'paid');
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

test('the same calendar days are meant wherever the reader sits', () => {
  // The reason this rule has one implementation: read as a local Date,
  // '2026-03-01' is still February 28th west of UTC, and the light would stand
  // on red a day before the reminder goes out. As calendar days it cannot.
  const zone = process.env.TZ;
  try {
    for (const candidate of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = candidate;
      assert.equal(daysUntil('2026-03-01', '2026-02-28'), 1, candidate);
      assert.equal(calcPaymentState(invoice('2026-03-01'), '2026-03-02'), 'overdue', candidate);
      assert.equal(calcPaymentState(invoice('2026-03-01'), '2026-03-01'), 'due', candidate);
    }
  } finally {
    process.env.TZ = zone;
  }
});
