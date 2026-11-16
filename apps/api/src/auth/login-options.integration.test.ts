import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import type { SettingKey, SettingValue } from '../settings/registry.js';
import { setApplicationValues } from '../settings/repository.js';
import { openTestDatabase, resetData, testConfig } from '../test/harness.js';

/**
 * `GET /login-options` (Slice 89): what the login page may know before anyone
 * signs in. The rows are written straight into the table — the PUT would
 * demand a complete provider, and this endpoint only reads the switch and the
 * label.
 */
test('login options: the ways in the login page offers', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  const app = createApp({ pool, config: testConfig({ database }) });
  const write = (values: Partial<Record<SettingKey, SettingValue>>) =>
    setApplicationValues(
      pool,
      new Map(Object.entries(values) as Array<[SettingKey, SettingValue]>),
    );
  const options = async () => {
    const res = await request(app).get('/api/v1/login-options');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data as unknown;
  };

  try {
    await runMigrations(pool);
    await resetData(pool);

    t.afterEach(() => resetData(pool));

    await t.test('without any row: the password form and no button', async () => {
      assert.deepEqual(await options(), { password: true, oidc: null });
    });

    await t.test('a switched-on provider without a label leaves the text to the web', async () => {
      await write({ 'login.oidcEnabled': true });
      assert.deepEqual(await options(), { password: true, oidc: { label: null } });
    });

    await t.test('the admin’s label comes along, trimmed; a blank one counts as none', async () => {
      await write({ 'login.oidcEnabled': true, 'login.oidcButtonLabel': '  Company login ' });
      assert.deepEqual(await options(), { password: true, oidc: { label: 'Company login' } });

      await write({ 'login.oidcButtonLabel': '   ' });
      assert.deepEqual(await options(), { password: true, oidc: { label: null } });
    });

    await t.test('a switched-off provider shows no button, whatever its label', async () => {
      await write({ 'login.oidcEnabled': false, 'login.oidcButtonLabel': 'Company login' });
      assert.deepEqual(await options(), { password: true, oidc: null });
    });

    await t.test('nothing about the provider itself leaves through the public door', async () => {
      await write({
        'login.oidcEnabled': true,
        'login.oidcIssuer': 'https://login.example.com/application/o/eunomia/',
        'login.oidcClientId': 'eunomia-client',
        'login.oidcLastTestResult': 'ok',
      });
      const body = JSON.stringify(await options());
      assert.doesNotMatch(body, /example\.com|eunomia-client|"ok"/);
    });
  } finally {
    await resetData(pool);
    await pool.end();
  }
});
