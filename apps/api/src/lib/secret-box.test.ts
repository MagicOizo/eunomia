import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  SecretBoxError,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  parseEncryptionKey,
} from './secret-box.js';

const key = randomBytes(32);
const otherKey = randomBytes(32);

test('a secret survives the round trip', () => {
  for (const plaintext of ['hunter2', '', 'ümläute und ein € im Passwort', 'a'.repeat(4096)]) {
    assert.equal(decryptSecret(encryptSecret(plaintext, key), key), plaintext);
  }
});

test('the stored form is self-describing and recognizable', () => {
  const stored = encryptSecret('hunter2', key);
  assert.match(stored, /^aes-256-gcm\$[\w+/=]+\$[\w+/=]+\$[\w+/=]*$/);
  assert.ok(isEncrypted(stored));
  assert.ok(!isEncrypted('smtp.example.com'));
  // The plaintext must not be recoverable from the envelope by eye.
  assert.ok(!stored.includes('hunter2'));
});

test('encrypting the same secret twice gives different ciphertext', () => {
  // A fresh IV per call: equal passwords must not be recognizable as equal.
  assert.notEqual(encryptSecret('hunter2', key), encryptSecret('hunter2', key));
});

test('decrypting with the wrong key fails instead of returning garbage', () => {
  const stored = encryptSecret('hunter2', key);
  assert.throws(() => decryptSecret(stored, otherKey), SecretBoxError);
});

test('a tampered ciphertext is rejected by the authentication tag', () => {
  const stored = encryptSecret('hunter2', key);
  const parts = stored.split('$');
  const ciphertext = Buffer.from(parts[3] ?? '', 'base64');
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
  parts[3] = ciphertext.toString('base64');
  assert.throws(() => decryptSecret(parts.join('$'), key), SecretBoxError);
});

test('a malformed envelope is rejected with a clear error', () => {
  for (const value of [
    'hunter2',
    'aes-256-gcm$only$three',
    'scrypt$32768$8$1$c2FsdA==$aGFzaA==',
    'aes-256-gcm$dG9vc2hvcnQ=$dG9vc2hvcnQ=$Zm9v',
  ]) {
    assert.throws(() => decryptSecret(value, key), SecretBoxError, value);
  }
});

test('parseEncryptionKey accepts exactly 32 bytes of base64', () => {
  const encoded = key.toString('base64');
  assert.deepEqual(parseEncryptionKey(encoded), key);
  assert.throws(() => parseEncryptionKey('too-short'), SecretBoxError);
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString('base64')), SecretBoxError);
  assert.throws(() => parseEncryptionKey(randomBytes(64).toString('base64')), SecretBoxError);
});
