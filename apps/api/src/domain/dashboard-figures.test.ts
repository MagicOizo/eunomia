import assert from 'node:assert/strict';
import test from 'node:test';

import { type DashboardInvoice, summarizeInvoices } from './dashboard-figures.js';

const TODAY = '2026-10-05';

const invoice = (overrides: Partial<DashboardInvoice> = {}): DashboardInvoice => ({
  accountUID: 'A',
  invoiceDate: '2026-03-01',
  treatmentYear: 2026,
  invoiceAmount: 100,
  reimbursedTotal: 0,
  allocationCount: 0,
  submissionCount: 0,
  reimbursementClosed: false,
  notCovered: false,
  transferDate: '2026-03-10',
  transferUntilDate: null,
  directPayment: false,
  ...overrides,
});

test('nothing to count: zeros, no start date, no years, no persons', () => {
  const summary = summarizeInvoices([], TODAY);
  assert.equal(summary.since, null);
  assert.deepEqual(summary.totals, {
    invoiceCount: 0,
    invoiceAmount: 0,
    reimbursed: 0,
    selfBorne: 0,
  });
  assert.deepEqual(summary.years, []);
  assert.equal(summary.accounts.size, 0);
});

test('self-borne is everything not reimbursed — running and not-covered invoices included', () => {
  const summary = summarizeInvoices(
    [
      // Fully reimbursed and closed: nothing self-borne.
      invoice({ invoiceAmount: 80, reimbursedTotal: 80, allocationCount: 1, submissionCount: 1 }),
      // Submitted, nothing answered yet: counts in full, the decision of 2026-10-05.
      invoice({ invoiceAmount: 50.1, submissionCount: 1 }),
      // Partly reimbursed.
      invoice({
        invoiceAmount: 120,
        reimbursedTotal: 99.9,
        allocationCount: 1,
        submissionCount: 1,
      }),
      // Not covered: never submitted, carried in full.
      invoice({ invoiceAmount: 30, notCovered: true }),
    ],
    TODAY,
  );
  assert.equal(summary.totals.invoiceCount, 4);
  assert.equal(summary.totals.invoiceAmount, 280.1);
  assert.equal(summary.totals.reimbursed, 179.9);
  assert.equal(summary.totals.selfBorne, 100.2);
});

test('a reimbursement above the amount bears no negative share', () => {
  const summary = summarizeInvoices(
    [
      invoice({ invoiceAmount: 100, reimbursedTotal: 110, allocationCount: 2, submissionCount: 2 }),
      invoice({ invoiceAmount: 40 }),
    ],
    TODAY,
  );
  assert.equal(summary.totals.reimbursed, 110);
  assert.equal(summary.totals.selfBorne, 40);
});

test('the year series runs by treatment year, oldest first; since is the earliest invoice date', () => {
  const summary = summarizeInvoices(
    [
      invoice({ treatmentYear: 2026, invoiceDate: '2026-01-15', invoiceAmount: 10 }),
      invoice({ treatmentYear: 2024, invoiceDate: '2025-01-05', invoiceAmount: 20 }),
      invoice({
        treatmentYear: 2025,
        invoiceDate: '2025-02-01',
        invoiceAmount: 30,
        reimbursedTotal: 30,
        allocationCount: 1,
        submissionCount: 1,
      }),
      invoice({ treatmentYear: 2026, invoiceDate: '2026-04-01', invoiceAmount: 5 }),
    ],
    TODAY,
  );
  assert.equal(summary.since, '2025-01-05');
  assert.deepEqual(summary.years, [
    { year: 2024, invoiceCount: 1, invoiceAmount: 20, reimbursed: 0, selfBorne: 20 },
    { year: 2025, invoiceCount: 1, invoiceAmount: 30, reimbursed: 30, selfBorne: 0 },
    { year: 2026, invoiceCount: 2, invoiceAmount: 15, reimbursed: 0, selfBorne: 15 },
  ]);
});

test('open reimbursement counts the three unfinished rungs, without not-covered invoices', () => {
  const summary = summarizeInvoices(
    [
      invoice(),
      invoice(),
      invoice({ submissionCount: 1 }),
      invoice({ submissionCount: 1, allocationCount: 1, reimbursedTotal: 40 }),
      // abgerechnet (closed by hand) and erledigt are done.
      invoice({ submissionCount: 1, reimbursementClosed: true, transferDate: null }),
      invoice({ submissionCount: 1, allocationCount: 1, reimbursedTotal: 100 }),
      invoice({ notCovered: true }),
    ],
    TODAY,
  );
  assert.deepEqual(summary.accounts.get('A')?.workflow, {
    offen: 2,
    eingereicht: 1,
    teilabgerechnet: 1,
  });
});

test('unpaid follows the payment light on the given day, per person', () => {
  const summary = summarizeInvoices(
    [
      invoice({ invoiceAmount: 10 }), // paid
      invoice({ invoiceAmount: 20, transferDate: null, directPayment: true }), // paid in cash
      invoice({ invoiceAmount: 30.5, transferDate: null, transferUntilDate: '2026-10-01' }),
      invoice({ invoiceAmount: 40, transferDate: null, transferUntilDate: '2026-10-10' }),
      invoice({ invoiceAmount: 50, transferDate: null, transferUntilDate: null }), // due: no date
      invoice({ invoiceAmount: 60, transferDate: null, transferUntilDate: '2026-12-01' }),
      invoice({ accountUID: 'B', invoiceAmount: 7, transferDate: null }),
    ],
    TODAY,
  );
  assert.deepEqual(summary.accounts.get('A')?.payment, {
    unpaidCount: 4,
    unpaidAmount: 180.5,
    dueCount: 2,
    overdueCount: 1,
  });
  assert.deepEqual(summary.accounts.get('B')?.payment, {
    unpaidCount: 1,
    unpaidAmount: 7,
    dueCount: 1,
    overdueCount: 0,
  });
});
