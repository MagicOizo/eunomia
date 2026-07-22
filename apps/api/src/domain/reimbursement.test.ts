import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateReimbursement } from './reimbursement.js';

// Base contract: 300 deductible, 600 bonus, no cap. Break-even total = 900.
const contract = { deductible: 300, bonus: 600, cap: null };

test('below the deductible: nothing reimbursable, not worth submitting', () => {
  const r = evaluateReimbursement({ ...contract, invoiceTotal: 200 });
  assert.equal(r.reimbursement, 0);
  assert.equal(r.worthSubmitting, false);
  assert.equal(r.breakEvenInvoiceTotal, 900);
  assert.equal(r.shortfallToBreakEven, 700);
});

test('between deductible and break-even: reimbursement below bonus, not worth', () => {
  const r = evaluateReimbursement({ ...contract, invoiceTotal: 800 });
  assert.equal(r.reimbursement, 500); // 800 - 300
  assert.equal(r.worthSubmitting, false);
  assert.equal(r.shortfallToBreakEven, 100);
});

test('exactly at break-even: reimbursement equals bonus, still not worth (strict)', () => {
  const r = evaluateReimbursement({ ...contract, invoiceTotal: 900 });
  assert.equal(r.reimbursement, 600);
  assert.equal(r.worthSubmitting, false);
  assert.equal(r.shortfallToBreakEven, 0);
});

test('above break-even: reimbursement beats the bonus, worth submitting', () => {
  const r = evaluateReimbursement({ ...contract, invoiceTotal: 1000 });
  assert.equal(r.reimbursement, 700);
  assert.equal(r.worthSubmitting, true);
  assert.equal(r.shortfallToBreakEven, 0);
});

test('zero bonus: worth submitting as soon as anything clears the deductible', () => {
  const r = evaluateReimbursement({ deductible: 300, bonus: 0, cap: null, invoiceTotal: 301 });
  assert.equal(r.reimbursement, 1);
  assert.equal(r.worthSubmitting, true);
});

test('cap binds the reimbursement and flags cappedOut', () => {
  const r = evaluateReimbursement({ deductible: 300, bonus: 600, cap: 1000, invoiceTotal: 5000 });
  assert.equal(r.reimbursement, 1000); // min(4700, 1000)
  assert.equal(r.cappedOut, true);
  assert.equal(r.worthSubmitting, true); // 1000 > 600
});

test('cap at or below the bonus: submitting is never worthwhile', () => {
  const r = evaluateReimbursement({ deductible: 300, bonus: 600, cap: 500, invoiceTotal: 100000 });
  assert.equal(r.reimbursement, 500);
  assert.equal(r.worthSubmitting, false);
  assert.equal(r.breakEvenInvoiceTotal, null);
  assert.equal(r.shortfallToBreakEven, null);
});

test('cent rounding stays exact', () => {
  const r = evaluateReimbursement({ deductible: 300.33, bonus: 0, cap: null, invoiceTotal: 400.1 });
  assert.equal(r.reimbursement, 99.77);
});
