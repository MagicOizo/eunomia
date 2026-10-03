import assert from 'node:assert/strict';
import test from 'node:test';

import { oneOf } from './one-of.js';

const KINDS = ['FULL', 'SUPPLEMENTARY'] as const;

test('a known value comes back as itself', () => {
  assert.equal(oneOf(KINDS, 'FULL', 'Contracts.contractKind'), 'FULL');
  assert.equal(oneOf(KINDS, 'SUPPLEMENTARY', 'Contracts.contractKind'), 'SUPPLEMENTARY');
});

test('anything else throws, naming the column and the value', () => {
  assert.throws(() => oneOf(KINDS, 'PARTIAL', 'Contracts.contractKind'), {
    message: 'Contracts.contractKind holds "PARTIAL", which is none of: FULL, SUPPLEMENTARY',
  });
  // Neither null nor a number is a value of the vocabulary — an empty column
  // and a column whose type drifted have to fail just as loudly.
  assert.throws(() => oneOf(KINDS, null, 'Contracts.contractKind'), /holds null/);
  assert.throws(() => oneOf(KINDS, 1, 'Contracts.contractKind'), /holds 1/);
  assert.throws(() => oneOf(KINDS, '', 'Contracts.contractKind'), /holds ""/);
});
