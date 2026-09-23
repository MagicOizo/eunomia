import assert from 'node:assert/strict';
import test from 'node:test';

import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { seedId } from './helpers.js';

test('seedId builds a valid, stable ID per entity and index', () => {
  const id = seedId('invoice', 3);
  assert.equal(id.length, 12);
  assert.match(id, entityIdPattern(ENTITY_PREFIX.invoice));
  assert.equal(seedId('invoice', 3), id, 'the same index yields the same ID');
});

/**
 * The UID columns use a case-insensitive collation, so two seed IDs differing
 * only in case would be one row to the UNIQUE index and `seedRow` would drop
 * the second without a word. Keeping the bodies out of the lowercase half is
 * what prevents that.
 */
test('seed IDs never differ only in case', () => {
  const ids = new Set<string>();
  for (let index = 0; index < 32; index += 1) {
    ids.add(seedId('invoice', index).toLowerCase());
  }
  assert.equal(ids.size, 32, 'every index folds to its own ID');
});

test('an index outside the usable range is rejected instead of colliding', () => {
  assert.throws(() => seedId('invoice', 32), /out of range/);
  assert.throws(() => seedId('invoice', -1), /out of range/);
});
