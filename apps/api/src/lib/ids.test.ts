import assert from 'node:assert/strict';
import test from 'node:test';

import { ENTITY_PREFIX, entityIdPattern, generateEntityId } from './ids.js';

test('generateEntityId produces a prefixed 12-character ID', () => {
  const id = generateEntityId('invoice');
  assert.equal(id.length, 12);
  assert.ok(id.startsWith(ENTITY_PREFIX.invoice));
  assert.match(id, entityIdPattern(ENTITY_PREFIX.invoice));
});

test('generateEntityId never emits ambiguous characters', () => {
  const forbidden = /[0O1Il]/;
  for (let i = 0; i < 500; i += 1) {
    const body = generateEntityId('account').slice(1);
    assert.doesNotMatch(body, forbidden);
  }
});

test('every entity has a distinct prefix', () => {
  const prefixes = Object.values(ENTITY_PREFIX);
  assert.equal(new Set(prefixes).size, prefixes.length);
});
