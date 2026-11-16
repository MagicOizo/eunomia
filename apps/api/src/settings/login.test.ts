import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import { assertLoginConfiguration } from './login.js';
import type { SettingKey, SettingValue } from './registry.js';
import type { PublicSetting } from './repository.js';

/** A stored state: plain values by key, plus which secrets are set. */
function stored(values: Partial<Record<SettingKey, SettingValue>>, secrets: SettingKey[] = []) {
  const rows: PublicSetting[] = [];
  for (const [key, value] of Object.entries(values) as Array<[SettingKey, SettingValue]>) {
    rows.push({ key, section: 'x', isSecret: false, readonly: false, value, isSet: true });
  }
  for (const key of secrets) {
    rows.push({ key, section: 'x', isSecret: true, readonly: false, value: null, isSet: true });
  }
  return rows;
}

const COMPLETE = stored(
  {
    'general.appUrl': 'https://eunomia.example.com',
    'login.oidcIssuer': 'https://login.example.com/application/o/eunomia/',
    'login.oidcClientId': 'eunomia',
  },
  ['login.oidcClientSecret'],
);

/** The `missing` list of the rejection, or null when the write is taken. */
function missingAfter(
  current: PublicSetting[],
  updates: Array<[SettingKey, SettingValue]>,
): unknown {
  try {
    assertLoginConfiguration(current, new Map(updates));
    return null;
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, ERROR_CODES.LOGIN_CONFIG_INCOMPLETE);
    return (error.details as { missing: unknown }).missing;
  }
}

test('switching on with everything stored is taken', () => {
  assert.equal(missingAfter(COMPLETE, [['login.oidcEnabled', true]]), null);
});

test('switching on with nothing stored names every missing setting', () => {
  assert.deepEqual(missingAfter([], [['login.oidcEnabled', true]]), [
    'general.appUrl',
    'login.oidcIssuer',
    'login.oidcClientId',
    'login.oidcClientSecret',
  ]);
});

test('values in the same write count', () => {
  assert.equal(
    missingAfter(
      [],
      [
        ['login.oidcEnabled', true],
        ['general.appUrl', 'https://eunomia.example.com'],
        ['login.oidcIssuer', 'https://login.example.com/application/o/eunomia/'],
        ['login.oidcClientId', 'eunomia'],
        ['login.oidcClientSecret', 's3cret'],
      ],
    ),
    null,
  );
});

test('clearing the secret or the address while switched on is refused', () => {
  const on = [...COMPLETE, ...stored({ 'login.oidcEnabled': true })];
  assert.deepEqual(missingAfter(on, [['login.oidcClientSecret', null]]), [
    'login.oidcClientSecret',
  ]);
  assert.deepEqual(missingAfter(on, [['general.appUrl', null]]), ['general.appUrl']);
});

test('switching off, or editing while off, is always taken', () => {
  const on = [...stored({ 'login.oidcEnabled': true })];
  assert.equal(missingAfter(on, [['login.oidcEnabled', false]]), null);
  assert.equal(missingAfter([], [['login.oidcIssuer', null]]), null);
});
