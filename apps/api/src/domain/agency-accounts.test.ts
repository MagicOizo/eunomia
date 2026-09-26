import assert from 'node:assert/strict';
import test from 'node:test';

import { accountInForce, withValidity } from './agency-accounts.js';

/**
 * The resolution rule of Slice 38, without a database. Its twin lives in
 * apps/web/src/agencies/accounts.spec.ts and asserts the same cases — the two
 * sides must agree, or a paid invoice would name a different account than the
 * mail about it.
 */

const undated = { agencyAccountUID: 'g1', validFrom: null, bankAccount: 'DE00' };
const from2024 = { agencyAccountUID: 'g2', validFrom: '2024-03-01', bankAccount: 'DE24' };
const from2026 = { agencyAccountUID: 'g3', validFrom: '2026-01-01', bankAccount: 'DE26' };
/** As the API hands them out: oldest first, the undated entry in front. */
const history = [undated, from2024, from2026];

test('accountInForce takes the newest account that had already started', () => {
  assert.equal(accountInForce(history, '2026-06-30')?.bankAccount, 'DE26');
  assert.equal(accountInForce(history, '2025-12-31')?.bankAccount, 'DE24');
});

test('accountInForce counts the day itself as started', () => {
  assert.equal(accountInForce(history, '2024-03-01')?.bankAccount, 'DE24');
  assert.equal(accountInForce(history, '2024-02-29')?.bankAccount, 'DE00');
});

test('an undated account applies to every date before the first change', () => {
  assert.equal(accountInForce(history, '1999-01-01')?.bankAccount, 'DE00');
  assert.equal(accountInForce([undated], '1999-01-01')?.bankAccount, 'DE00');
});

test('without an undated account, a date before the first one has none', () => {
  assert.equal(accountInForce([from2024, from2026], '2020-01-01'), null);
});

test('no date means today, so the newest started account wins', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(accountInForce(history)?.bankAccount, 'DE26');
  assert.equal(
    accountInForce([
      ...history,
      { agencyAccountUID: 'g4', validFrom: tomorrow, bankAccount: 'DEXX' },
    ])?.bankAccount,
    'DE26',
  );
});

test('an agency without any account resolves to null', () => {
  assert.equal(accountInForce([], '2026-06-30'), null);
});

test('withValidity ends each account the day before the next one starts', () => {
  assert.deepEqual(
    withValidity(history).map((account) => [account.validFrom, account.validTo]),
    [
      [null, '2024-02-29'],
      ['2024-03-01', '2025-12-31'],
      ['2026-01-01', null],
    ],
  );
});
