import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultPaymentDetail } from './agency-payment-details.js';

/**
 * The suggestion rule of Slice 44, without a database. Its twin lives in
 * apps/web/src/agencies/payment-details.spec.ts and asserts the same cases — the
 * create form and the detail mask must suggest the same payment details.
 */

const first = { agencyAccountUID: 'g1', bankAccount: 'DE00' };
const second = { agencyAccountUID: 'g2', bankAccount: 'DE24' };
/** As the API hands them out: in the order they were recorded. */
const details = [first, second];

test('defaultPaymentDetail suggests the details recorded first', () => {
  assert.equal(defaultPaymentDetail(details)?.bankAccount, 'DE00');
});

test('an agency without any payment details has nothing to suggest', () => {
  assert.equal(defaultPaymentDetail([]), null);
});
