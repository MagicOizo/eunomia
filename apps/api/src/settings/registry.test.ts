import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import {
  SETTING_KEYS,
  fallbackOf,
  isSecretKey,
  isSettingKey,
  parseStoredValue,
  serializeValue,
  validateIncoming,
} from './registry.js';

/** Asserts that a write is rejected with a specific code. */
function rejects(key: string, value: unknown, code: string): void {
  assert.throws(
    () => validateIncoming(key, value),
    (error: unknown) => error instanceof ApiError && error.code === code,
    `${key} = ${JSON.stringify(value)}`,
  );
}

test('an unknown key is rejected instead of being stored', () => {
  rejects('mail.hostname', 'smtp.example.com', ERROR_CODES.SETTING_UNKNOWN);
  rejects('__proto__', 'x', ERROR_CODES.SETTING_UNKNOWN);
  assert.ok(isSettingKey('mail.host'));
  assert.ok(!isSettingKey('mail.hostname'));
});

test('the status keys belong to the application and cannot be written through the API', () => {
  for (const key of ['mail.lastSendAt', 'mail.lastSendResult', 'mail.lastSendError']) {
    rejects(key, 'ok', ERROR_CODES.SETTING_READONLY);
  }
});

test('null clears any setting', () => {
  assert.deepEqual(validateIncoming('mail.host', null), ['mail.host', null]);
  assert.deepEqual(validateIncoming('mail.password', null), ['mail.password', null]);
  assert.deepEqual(validateIncoming('mail.enabled', null), ['mail.enabled', null]);
});

test('an empty secret clears it rather than storing an empty password', () => {
  // A form that submits every field must not be able to blank the password by
  // sending the placeholder as an empty string.
  assert.deepEqual(validateIncoming('mail.password', ''), ['mail.password', null]);
  assert.deepEqual(validateIncoming('mail.password', '   '), ['mail.password', null]);
  // A real secret is kept verbatim: leading/trailing spaces may be part of it.
  assert.deepEqual(validateIncoming('mail.password', ' hunter2 '), ['mail.password', ' hunter2 ']);
});

test('control characters are rejected in text settings and secrets', () => {
  // The sender name goes into the From header of every mail; a line break there
  // is a header injection we do not want to leave to nodemailer's encoding.
  rejects(
    'mail.fromName',
    'Eunomia\r\nBcc: someone@example.com',
    ERROR_CODES.SETTING_INVALID_VALUE,
  );
  rejects('mail.host', 'smtp.example.com\n', ERROR_CODES.SETTING_INVALID_VALUE);
  rejects('mail.password', 'hunter2\r\n', ERROR_CODES.SETTING_INVALID_VALUE);
  // An ordinary value with spaces and umlauts stays welcome.
  assert.deepEqual(validateIncoming('mail.fromName', 'Eunomia Rechnungen'), [
    'mail.fromName',
    'Eunomia Rechnungen',
  ]);
});

test('strings are trimmed, length-checked and empty means unset', () => {
  assert.deepEqual(validateIncoming('mail.host', '  smtp.example.com '), [
    'mail.host',
    'smtp.example.com',
  ]);
  assert.deepEqual(validateIncoming('mail.host', ''), ['mail.host', null]);
  rejects('mail.host', 'x'.repeat(256), ERROR_CODES.SETTING_INVALID_VALUE);
  rejects('mail.host', 25, ERROR_CODES.SETTING_INVALID_VALUE);
});

test('the port must be a whole number inside the valid range', () => {
  assert.deepEqual(validateIncoming('mail.port', 465), ['mail.port', 465]);
  for (const value of [0, 65536, 587.5, '587', true]) {
    rejects('mail.port', value, ERROR_CODES.SETTING_INVALID_VALUE);
  }
});

test('booleans take only real booleans', () => {
  assert.deepEqual(validateIncoming('mail.enabled', true), ['mail.enabled', true]);
  for (const value of ['true', 1, 'on']) {
    rejects('mail.enabled', value, ERROR_CODES.SETTING_INVALID_VALUE);
  }
});

test('the auth method accepts only the values the mailer implements', () => {
  assert.deepEqual(validateIncoming('mail.authMethod', 'PASSWORD'), [
    'mail.authMethod',
    'PASSWORD',
  ]);
  // XOAUTH2 is prepared in the model but not implemented — see the backlog.
  rejects('mail.authMethod', 'OAUTH2', ERROR_CODES.SETTING_INVALID_VALUE);
});

test('stored text round-trips through serialize and parse for every key', () => {
  for (const key of SETTING_KEYS) {
    const fallback = fallbackOf(key);
    assert.equal(parseStoredValue(key, null), fallback, `${key} falls back`);
    if (fallback !== null) {
      assert.equal(parseStoredValue(key, serializeValue(fallback)), fallback, `${key} round-trips`);
    }
  }
});

test('an unparsable stored value falls back instead of breaking the page', () => {
  assert.equal(parseStoredValue('mail.port', 'not-a-number'), 587);
  assert.equal(parseStoredValue('mail.enabled', 'yes'), false);
});

test('only the password and the GitHub token are secrets', () => {
  const secrets = SETTING_KEYS.filter(isSecretKey);
  assert.deepEqual(secrets, ['mail.password', 'updateCheck.token']);
});
