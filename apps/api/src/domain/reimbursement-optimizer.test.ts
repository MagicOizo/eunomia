import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type InvoicePolicyState,
  type OptimizerInvoice,
  type OptimizerPolicy,
  type OptimizerResult,
  optimizeReimbursement,
} from './reimbursement-optimizer.js';

// The author's example (Notes/eunomia-plan.md, 2.3): PKV x with a 200 €
// deductible and a bonus scale 300/450/600 €, supplementary y paying up to
// 200 € a year.
const pkvX = (bonusAmount: number, overrides: Partial<OptimizerPolicy> = {}): OptimizerPolicy => ({
  contractUID: 'x',
  contractNumber: 'X-1',
  kind: 'FULL',
  deductible: 200,
  reimbursementCap: null,
  reimbursementRate: 100,
  bonusMode: 'choice',
  bonusAmount,
  ...overrides,
});
const zusatzY = (overrides: Partial<OptimizerPolicy> = {}): OptimizerPolicy => ({
  contractUID: 'y',
  contractNumber: 'Y-1',
  kind: 'SUPPLEMENTARY',
  deductible: 0,
  reimbursementCap: 200,
  reimbursementRate: 100,
  bonusMode: 'forfeited',
  bonusAmount: 0,
  ...overrides,
});

let counter = 0;
const invoice = (
  amount: number,
  policies: Partial<Record<string, InvoicePolicyState>> = {},
  overrides: Partial<OptimizerInvoice> = {},
): OptimizerInvoice => {
  counter += 1;
  return {
    invoiceUID: `inv-${String(counter).padStart(3, '0')}`,
    amount,
    treatmentDate: `2025-01-${String(counter % 28 || 28).padStart(2, '0')}`,
    reimbursementClosed: false,
    policies,
    ...overrides,
  };
};
const excluded: InvoicePolicyState = {
  excluded: true,
  submitted: false,
  actualReimbursement: null,
};
const submitted: InvoicePolicyState = {
  excluded: false,
  submitted: true,
  actualReimbursement: null,
};
const answered = (amount: number): InvoicePolicyState => ({
  excluded: false,
  submitted: true,
  actualReimbursement: amount,
});

const best = (result: OptimizerResult) => {
  const [first] = result.strategies;
  assert.ok(first);
  return first;
};
const policy = (result: OptimizerResult, uid: string) => {
  const found = result.policies.find((p) => p.contractUID === uid);
  assert.ok(found, `policy ${uid} missing`);
  return found;
};
const totalFor = (result: OptimizerResult, used: string[]) => {
  const found = result.strategies.find(
    (s) => s.usedContractUIDs.join() === [...used].sort().join(),
  );
  assert.ok(found, `strategy ${used.join()} missing`);
  return found.total;
};

test('example year 1: 150 € → spare x, submit to y only (450 € vs 150 €)', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(300), zusatzY()],
    invoices: [invoice(150)],
  });
  assert.deepEqual(best(result).usedContractUIDs, ['y']);
  assert.equal(best(result).total, 450);
  assert.equal(totalFor(result, ['x', 'y']), 150);
  assert.equal(result.advantage, 300);
  assert.equal(policy(result, 'x').recommendation, 'spare');
  // Using x catches up once further costs reach 350 €: 300 + 200 = 200 + 300.
  assert.equal(policy(result, 'x').worthUsingAbove, 350);
  const [plan] = result.invoices;
  assert.equal(plan?.action, 'submit');
  assert.deepEqual(
    plan?.policies.map((p) => [p.contractUID, p.action, p.reimbursement]),
    [
      ['x', 'none', 0],
      ['y', 'submit', 150],
    ],
  );
});

test('example year 2: 640 € → spare x, submit to y only (650 € vs 640 €)', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(450), zusatzY()],
    invoices: [invoice(400), invoice(240)],
  });
  assert.deepEqual(best(result).usedContractUIDs, ['y']);
  assert.equal(best(result).total, 650);
  assert.equal(totalFor(result, ['x', 'y']), 640);
  assert.equal(result.advantage, 10);
  assert.equal(policy(result, 'x').worthUsingAbove, 10);
  assert.equal(policy(result, 'y').expectedReimbursement, 200);
  // y's cap is used up by the first invoice; the second one is held back.
  assert.deepEqual(
    result.invoices.map((p) => p.action),
    ['submit', 'hold'],
  );
});

test('example year 3: 1000 € → submit to x, the rest to y (1000 € vs 800 €)', () => {
  const result = optimizeReimbursement({
    policies: [zusatzY(), pkvX(600)],
    invoices: [invoice(150), invoice(850)],
  });
  assert.deepEqual(best(result).usedContractUIDs, ['x', 'y']);
  assert.equal(best(result).total, 1000);
  assert.equal(totalFor(result, ['y']), 800);
  assert.equal(policy(result, 'x').expectedReimbursement, 800);
  assert.equal(policy(result, 'x').worthUsingAbove, undefined);
  // The deductible is taken by the earlier invoice; y covers exactly that rest.
  assert.deepEqual(
    result.invoices.map((p) => p.policies.map((e) => [e.contractUID, e.action, e.reimbursement])),
    [
      [
        ['x', 'submit', 0],
        ['y', 'submit', 150],
      ],
      [
        ['x', 'submit', 800],
        ['y', 'submit', 50],
      ],
    ],
  );
});

test('without a supplementary policy only the bonus is weighed against the reimbursement', () => {
  const spare = optimizeReimbursement({ policies: [pkvX(300)], invoices: [invoice(450)] });
  assert.deepEqual(best(spare).usedContractUIDs, []);
  assert.equal(best(spare).total, 300);
  assert.equal(policy(spare, 'x').worthUsingAbove, 50);

  const use = optimizeReimbursement({ policies: [pkvX(300)], invoices: [invoice(900)] });
  assert.deepEqual(best(use).usedContractUIDs, ['x']);
  assert.equal(best(use).total, 700);
});

test('a cap below the bonus never makes using the policy worthwhile', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(300, { reimbursementCap: 250 })],
    invoices: [invoice(5000)],
  });
  assert.equal(policy(result, 'x').recommendation, 'spare');
  assert.equal(policy(result, 'x').worthUsingAbove, null);
});

test('an already forfeited bonus leaves no choice: the policy is used', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(0, { bonusMode: 'forfeited' }), zusatzY()],
    invoices: [invoice(150)],
  });
  assert.equal(result.strategies.length, 1);
  assert.equal(result.advantage, null);
  assert.deepEqual(best(result).usedContractUIDs, ['x', 'y']);
  // Below the deductible x pays nothing, but the invoice still counts towards it.
  assert.deepEqual(
    result.invoices[0]?.policies.map((p) => p.action),
    ['submit', 'submit'],
  );
});

test('invoices excluded everywhere are not reimbursable and change nothing', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(300), zusatzY()],
    invoices: [invoice(800, { x: excluded, y: excluded })],
  });
  assert.equal(result.invoiceTotal, 800);
  assert.equal(best(result).total, 300);
  assert.equal(result.invoices[0]?.action, 'not-reimbursable');
});

test('an exclusion at x leaves the invoice fully to y', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(0, { bonusMode: 'forfeited' }), zusatzY()],
    invoices: [invoice(180, { x: excluded })],
  });
  assert.deepEqual(
    result.invoices[0]?.policies.map((p) => [p.action, p.reimbursement]),
    [
      ['excluded', 0],
      ['submit', 180],
    ],
  );
});

test('a rate below 100 % scales the reimbursement above the deductible', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(0, { bonusMode: 'forfeited', reimbursementRate: 80 })],
    invoices: [invoice(1200)],
  });
  assert.equal(policy(result, 'x').expectedReimbursement, 800);
});

test('recorded reimbursements are reality: they use up deductible and cap', () => {
  const result = optimizeReimbursement({
    policies: [
      pkvX(0, { bonusMode: 'forfeited', reimbursementCap: 1000 }),
      zusatzY({ reimbursementCap: 500 }),
    ],
    invoices: [
      // x paid less than the model would (items cut): 600 - 200 deductible = 400, paid 300.
      invoice(600, { x: answered(300) }),
      invoice(900),
    ],
  });
  const [first, second] = result.invoices;
  assert.deepEqual(
    first?.policies.map((p) => [p.action, p.reimbursement]),
    [
      ['answered', 300],
      ['submit', 300],
    ],
  );
  // Deductible used up by the answered invoice; x's cap has 700 € left.
  assert.deepEqual(
    second?.policies.map((p) => [p.action, p.reimbursement]),
    [
      ['submit', 700],
      ['submit', 200],
    ],
  );
  assert.equal(policy(result, 'x').actualReimbursement, 300);
  assert.equal(policy(result, 'x').expectedReimbursement, 1000);
});

test('a pending submission at a policy that should be spared is to be withdrawn', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(300), zusatzY()],
    invoices: [invoice(150, { x: submitted })],
  });
  assert.equal(policy(result, 'x').recommendation, 'spare');
  assert.equal(result.invoices[0]?.action, 'withdraw');
  assert.deepEqual(
    result.invoices[0]?.policies.map((p) => p.action),
    ['withdraw', 'submit'],
  );
});

test('a submission already at the right policy is done', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(300), zusatzY()],
    invoices: [invoice(150, { y: submitted })],
  });
  assert.equal(result.invoices[0]?.action, 'done');
  assert.deepEqual(
    result.invoices[0]?.policies.map((p) => p.action),
    ['none', 'submitted'],
  );
});

test('a bonus already paid out fixes the policy as spared', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(450, { bonusMode: 'paid' }), zusatzY()],
    invoices: [invoice(5000)],
  });
  assert.equal(result.strategies.length, 1);
  assert.equal(policy(result, 'x').recommendation, 'spare');
  assert.equal(policy(result, 'x').worthUsingAbove, undefined);
  assert.equal(best(result).total, 650);
});

test('invoices closed by hand get no further recommendation', () => {
  const result = optimizeReimbursement({
    policies: [pkvX(0, { bonusMode: 'forfeited' }), zusatzY()],
    invoices: [invoice(300, { x: answered(100) }, { reimbursementClosed: true })],
  });
  assert.equal(result.invoices[0]?.action, 'done');
  assert.equal(policy(result, 'y').expectedReimbursement, 0);
});

test('a tie spares the policy', () => {
  const result = optimizeReimbursement({ policies: [pkvX(300)], invoices: [invoice(500)] });
  assert.equal(result.advantage, 0);
  assert.equal(policy(result, 'x').recommendation, 'spare');
  assert.equal(policy(result, 'x').worthUsingAbove, 0);
});

test('several choices are enumerated together', () => {
  const second = pkvX(100, { contractUID: 'z', contractNumber: 'Z-1' });
  const result = optimizeReimbursement({
    policies: [pkvX(300), second],
    invoices: [invoice(450)],
  });
  assert.equal(result.strategies.length, 4);
  // z (bonus 100) takes 250 € above its deductible; x keeps its 300 €.
  assert.deepEqual(best(result).usedContractUIDs, ['z']);
  assert.equal(best(result).total, 550);
});
