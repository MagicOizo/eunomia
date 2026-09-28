import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultAccount } from './agency-accounts.js';

/**
 * The suggestion rule of Slice 44, without a database. Its twin lives in
 * apps/web/src/agencies/accounts.spec.ts and asserts the same cases — the
 * create form and the detail mask must suggest the same account.
 */

const first = { agencyAccountUID: 'g1', bankAccount: 'DE00' };
const second = { agencyAccountUID: 'g2', bankAccount: 'DE24' };
/** As the API hands them out: in the order they were recorded. */
const accounts = [first, second];

test('defaultAccount suggests the account recorded first', () => {
  assert.equal(defaultAccount(accounts)?.bankAccount, 'DE00');
});

test('an agency without any account has nothing to suggest', () => {
  assert.equal(defaultAccount([]), null);
});
