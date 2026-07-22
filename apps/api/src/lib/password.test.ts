import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPassword, verifyPassword } from './password.js';

test('a hashed password verifies against the original', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
});

test('verification fails for the wrong password', async () => {
  const hash = await hashPassword('s3cret');
  assert.equal(await verifyPassword('S3cret', hash), false);
});

test('the same password hashes to different values (random salt)', async () => {
  const a = await hashPassword('same');
  const b = await hashPassword('same');
  assert.notEqual(a, b);
});

test('a malformed hash verifies to false instead of throwing', async () => {
  assert.equal(await verifyPassword('x', 'not-a-valid-hash'), false);
  assert.equal(await verifyPassword('x', 'scrypt$bad'), false);
});
