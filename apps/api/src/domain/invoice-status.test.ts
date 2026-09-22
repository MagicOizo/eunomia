import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveInvoiceStatus, deriveSubmissionStatus } from './invoice-status.js';

const base = {
  invoiceAmount: 100,
  reimbursedTotal: 0,
  allocationCount: 0,
  submissionCount: 0,
  reimbursementClosed: false,
  transferDate: null,
};

test('not submitted anywhere: offen, even when already paid', () => {
  const r = deriveInvoiceStatus({ ...base, transferDate: '2024-03-01' });
  assert.equal(r.workflowStatus, 'offen');
  assert.equal(r.remainingAmount, 100);
});

test('submitted without reimbursement: eingereicht', () => {
  assert.equal(deriveInvoiceStatus({ ...base, submissionCount: 2 }).workflowStatus, 'eingereicht');
});

test('partial reimbursement: teilabgerechnet with the remainder, regardless of payment', () => {
  const r = deriveInvoiceStatus({
    ...base,
    submissionCount: 1,
    allocationCount: 1,
    reimbursedTotal: 70.1,
    transferDate: '2024-03-01',
  });
  assert.equal(r.workflowStatus, 'teilabgerechnet');
  assert.equal(r.remainingAmount, 29.9);
});

test('a 0 € reimbursement already counts as billed', () => {
  const r = deriveInvoiceStatus({ ...base, submissionCount: 1, allocationCount: 1 });
  assert.equal(r.workflowStatus, 'teilabgerechnet');
});

test('full reimbursement over two policies: abgerechnet, then erledigt once paid', () => {
  const full = {
    ...base,
    submissionCount: 2,
    allocationCount: 2,
    reimbursedTotal: 0.1 + 99.9,
  };
  assert.equal(deriveInvoiceStatus(full).workflowStatus, 'abgerechnet');
  assert.equal(deriveInvoiceStatus(full).remainingAmount, 0);
  assert.equal(
    deriveInvoiceStatus({ ...full, transferDate: '2024-03-01' }).workflowStatus,
    'erledigt',
  );
});

test('closed by hand counts as abgerechnet, even without any reimbursement', () => {
  const closed = { ...base, submissionCount: 1, reimbursementClosed: true };
  assert.equal(deriveInvoiceStatus(closed).workflowStatus, 'abgerechnet');
  assert.equal(deriveInvoiceStatus(closed).remainingAmount, 100);
  assert.equal(
    deriveInvoiceStatus({ ...closed, transferDate: '2024-03-01' }).workflowStatus,
    'erledigt',
  );
});

test('submission status follows its own allocations', () => {
  assert.equal(deriveSubmissionStatus(0), 'eingereicht');
  assert.equal(deriveSubmissionStatus(1), 'abgerechnet');
});
