import assert from 'node:assert/strict';
import test from 'node:test';

import { likeTerm } from './like.js';

test('ordinary text is only wrapped', () => {
  assert.equal(likeTerm('R-2024'), '%R-2024%');
  assert.equal(likeTerm(''), '%%');
});

test('the wildcards and the escape character itself are escaped', () => {
  assert.equal(likeTerm('%'), '%!%%');
  assert.equal(likeTerm('_'), '%!_%');
  assert.equal(likeTerm('!'), '%!!%');
  assert.equal(likeTerm('50%_off!'), '%50!%!_off!!%');
});
