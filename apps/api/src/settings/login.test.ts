import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import {
  assertLoginConfiguration,
  assertPasswordLoginLocks,
  oidcTestStatusResetFor,
  touchesOidcConfiguration,
} from './login.js';
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

const STATUS_KEYS = [
  'login.oidcLastTestAt',
  'login.oidcLastTestResult',
  'login.oidcLastTestError',
  'login.oidcLastTestDetail',
];

test('a changed issuer or client ID clears the last connection test', () => {
  for (const [key, value] of [
    ['login.oidcIssuer', 'https://other.example.com/application/o/eunomia/'],
    ['login.oidcIssuer', null],
    ['login.oidcClientId', 'someone-else'],
  ] as Array<[SettingKey, SettingValue]>) {
    assert.deepEqual(oidcTestStatusResetFor(COMPLETE, new Map([[key, value]])), STATUS_KEYS, key);
  }
});

test('writing the secret clears the status, since it cannot be compared', () => {
  assert.deepEqual(
    oidcTestStatusResetFor(COMPLETE, new Map([['login.oidcClientSecret', 'new-secret']])),
    STATUS_KEYS,
  );
  assert.deepEqual(
    oidcTestStatusResetFor(COMPLETE, new Map([['login.oidcClientSecret', null]])),
    STATUS_KEYS,
  );
});

test('resubmitting the same provider or saving other fields keeps the status', () => {
  const same = new Map<SettingKey, SettingValue>([
    ['login.oidcIssuer', 'https://login.example.com/application/o/eunomia/'],
    ['login.oidcClientId', 'eunomia'],
    ['login.oidcButtonLabel', 'Company login'],
    ['login.oidcEnabled', true],
    ['general.appUrl', 'https://new.example.com'],
  ]);
  assert.deepEqual(oidcTestStatusResetFor(COMPLETE, same), []);
});

test('the discovery cache is dropped for login keys and the instance address only', () => {
  assert.equal(touchesOidcConfiguration(new Map([['login.oidcButtonLabel', 'x']])), true);
  assert.equal(touchesOidcConfiguration(new Map([['general.appUrl', null]])), true);
  assert.equal(touchesOidcConfiguration(new Map([['mail.host', 'smtp.example.com']])), false);
  assert.equal(touchesOidcConfiguration(new Map()), false);
});

/* The two locks in front of the password switch (Slice 90). */

/** A provider that is on and was tested green — the state that may close the password login. */
const READY = [
  ...COMPLETE,
  ...stored({ 'login.oidcEnabled': true, 'login.oidcLastTestResult': 'ok' }),
];

/** The code of the rejection, or null when the write is taken. */
function lockAfter(current: PublicSetting[], updates: Array<[SettingKey, SettingValue]>): unknown {
  try {
    assertPasswordLoginLocks(current, new Map(updates));
    return null;
  } catch (error) {
    assert.ok(error instanceof ApiError);
    return error.code;
  }
}

test('closing the password login with a tested provider is taken', () => {
  assert.equal(lockAfter(READY, [['login.passwordEnabled', false]]), null);
});

test('closing the password login while the provider is off is refused', () => {
  const off = READY.map((row) =>
    row.key === 'login.oidcEnabled' ? { ...row, value: false } : row,
  );
  assert.equal(lockAfter(off, [['login.passwordEnabled', false]]), ERROR_CODES.LOGIN_NO_WAY_IN);
});

test('closing the password login and switching the provider off at once is refused', () => {
  assert.equal(
    lockAfter(READY, [
      ['login.passwordEnabled', false],
      ['login.oidcEnabled', false],
    ]),
    ERROR_CODES.LOGIN_NO_WAY_IN,
  );
});

test('switching the provider off while the password login is closed is refused', () => {
  const closed = [...READY, ...stored({ 'login.passwordEnabled': false })];
  assert.equal(lockAfter(closed, [['login.oidcEnabled', false]]), ERROR_CODES.LOGIN_NO_WAY_IN);
});

test('closing the password login without a green test is refused', () => {
  for (const result of ['error', null]) {
    const untested = READY.map((row) =>
      row.key === 'login.oidcLastTestResult' ? { ...row, value: result } : row,
    );
    assert.equal(
      lockAfter(untested, [['login.passwordEnabled', false]]),
      ERROR_CODES.LOGIN_TEST_REQUIRED,
    );
  }
});

test('a write that changes the provider while closing takes the green test with it', () => {
  assert.equal(
    lockAfter(READY, [
      ['login.passwordEnabled', false],
      ['login.oidcIssuer', 'https://other.example.com/application/o/eunomia/'],
    ]),
    ERROR_CODES.LOGIN_TEST_REQUIRED,
  );
  assert.equal(
    lockAfter(READY, [
      ['login.passwordEnabled', false],
      ['login.oidcClientSecret', 'new-secret'],
    ]),
    ERROR_CODES.LOGIN_TEST_REQUIRED,
  );
});

test('once closed, the provider can be repaired without a green test', () => {
  const closedAndBroken = [
    ...READY.map((row) =>
      row.key === 'login.oidcLastTestResult' ? { ...row, value: 'error' } : row,
    ),
    ...stored({ 'login.passwordEnabled': false }),
  ];
  assert.equal(
    lockAfter(closedAndBroken, [
      ['login.oidcIssuer', 'https://fixed.example.com/application/o/eunomia/'],
    ]),
    null,
  );
  // Saving the whole form again, with the switch still off, is no step either.
  assert.equal(lockAfter(closedAndBroken, [['login.passwordEnabled', false]]), null);
});

test('opening the password login again is always taken', () => {
  const closed = [...stored({ 'login.passwordEnabled': false })];
  assert.equal(lockAfter(closed, [['login.passwordEnabled', true]]), null);
  // Clearing the row means the fallback, which is open.
  assert.equal(lockAfter(closed, [['login.passwordEnabled', null]]), null);
  assert.equal(
    lockAfter(closed, [
      ['login.passwordEnabled', true],
      ['login.oidcEnabled', false],
    ]),
    null,
  );
});

test('without a stored row the password login counts as open', () => {
  assert.equal(lockAfter([], [['login.oidcEnabled', false]]), null);
  assert.equal(
    lockAfter(
      [...COMPLETE, ...stored({ 'login.oidcEnabled': true })],
      [['login.passwordEnabled', false]],
    ),
    ERROR_CODES.LOGIN_TEST_REQUIRED,
  );
});
