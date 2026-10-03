import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultPaymentDetail } from './payment-details.js';

const details = [{ bankAccount: 'DE00' }, { bankAccount: 'DE11' }];

test('the details recorded first are the suggestion', () => {
  assert.equal(defaultPaymentDetail(details)?.bankAccount, 'DE00');
});

test('an agency without payment details suggests nothing', () => {
  assert.equal(defaultPaymentDetail([]), null);
});
