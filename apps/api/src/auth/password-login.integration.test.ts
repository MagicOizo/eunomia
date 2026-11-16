import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import type { SettingKey, SettingValue } from '../settings/registry.js';
import { setApplicationValues } from '../settings/repository.js';
import { ADMIN, bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';
import { captureLog } from '../test/log-capture.js';

const ENCRYPTION_KEY = randomBytes(32);

/**
 * The password door (Slice 90): the switch in the settings, its two locks, the
 * login endpoint that answers first, and PASSWORD_LOGIN_FORCE as the way out.
 *
 * Every test that closes the door opens it again afterwards (blueprint, Fund 8):
 * `resetData` clears SystemSettings, and the suite bootstraps its own admin
 * before each test, so nothing leans on another suite's rows.
 */
test('password login: the switch, its locks and the way out', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  const config = testConfig({ database, configEncryptionKey: ENCRYPTION_KEY });
  const forced = testConfig({
    database,
    configEncryptionKey: ENCRYPTION_KEY,
    passwordLoginForce: true,
  });
  const app = createApp({ pool, config });
  const forcedApp = createApp({ pool, config: forced });

  const write = (values: Partial<Record<SettingKey, SettingValue>>) =>
    setApplicationValues(
      pool,
      new Map(Object.entries(values) as Array<[SettingKey, SettingValue]>),
    );
  const storedSwitch = async (): Promise<string | null> => {
    const rows = await pool.query<Array<{ settingValue: string | null }>>(
      "SELECT settingValue FROM SystemSettings WHERE settingKey = 'login.passwordEnabled'",
    );
    return rows[0]?.settingValue ?? null;
  };

  /** A complete, switched-on provider — the secret through the PUT, so it is encrypted. */
  async function provider(admin: Record<string, string>, lastTest: 'ok' | 'error' | null) {
    const res = await request(app)
      .put('/api/v1/settings')
      .set(admin)
      .send({
        values: {
          'general.appUrl': 'https://eunomia.example.com',
          'login.oidcIssuer': 'https://login.example.com/application/o/eunomia/',
          'login.oidcClientId': 'eunomia',
          'login.oidcClientSecret': 'provider-secret',
          'login.oidcEnabled': true,
        },
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // The status is the application's to write; the test stands in for it.
    if (lastTest !== null) await write({ 'login.oidcLastTestResult': lastTest });
  }

  const putSwitch = (admin: Record<string, string>, values: Record<string, unknown>) =>
    request(app).put('/api/v1/settings').set(admin).send({ values });

  try {
    await runMigrations(pool);
    await resetData(pool);

    t.beforeEach(() => resetData(pool));
    t.afterEach(() => resetData(pool));

    await t.test('closing needs a provider that was tested green', async () => {
      const { admin } = await bootstrapAdmin(app);

      const noProvider = await putSwitch(admin, { 'login.passwordEnabled': false });
      assert.equal(noProvider.status, 400);
      assert.equal(noProvider.body.error.code, ERROR_CODES.LOGIN_NO_WAY_IN);

      await provider(admin, 'error');
      const red = await putSwitch(admin, { 'login.passwordEnabled': false });
      assert.equal(red.status, 400);
      assert.equal(red.body.error.code, ERROR_CODES.LOGIN_TEST_REQUIRED);
      assert.equal(await storedSwitch(), null, 'a refused write leaves no row');

      await write({ 'login.oidcLastTestResult': 'ok' });
      const green = await putSwitch(admin, { 'login.passwordEnabled': false });
      assert.equal(green.status, 200, JSON.stringify(green.body));
      assert.equal(await storedSwitch(), 'false');
    });

    await t.test(
      'once closed: provider stays on, repairable, and the way back is open',
      async () => {
        const { admin } = await bootstrapAdmin(app);
        await provider(admin, 'ok');
        assert.equal((await putSwitch(admin, { 'login.passwordEnabled': false })).status, 200);

        const providerOff = await putSwitch(admin, { 'login.oidcEnabled': false });
        assert.equal(providerOff.status, 400);
        assert.equal(providerOff.body.error.code, ERROR_CODES.LOGIN_NO_WAY_IN);

        // A changed issuer clears the green status — and is still taken.
        const repaired = await putSwitch(admin, {
          'login.oidcIssuer': 'https://other.example.com/application/o/eunomia/',
        });
        assert.equal(repaired.status, 200, JSON.stringify(repaired.body));

        const back = await putSwitch(admin, {
          'login.passwordEnabled': true,
          'login.oidcEnabled': false,
        });
        assert.equal(back.status, 200, JSON.stringify(back.body));
        assert.equal(await storedSwitch(), 'true');
      },
    );

    await t.test('a closed door answers 403 before anything else, and logs nothing', async () => {
      await bootstrapAdmin(app);
      await write({ 'login.oidcEnabled': true, 'login.passwordEnabled': false });

      const { result, lines } = await captureLog(async () => ({
        right: await request(app)
          .post('/api/v1/auth/login')
          .send({ email: ADMIN.email, password: ADMIN.password }),
        wrong: await request(app)
          .post('/api/v1/auth/login')
          .send({ email: ADMIN.email, password: 'not-the-password' }),
        // Not even read: a body the schema would refuse gets the same answer.
        garbage: await request(app).post('/api/v1/auth/login').send({ nonsense: true }),
      }));
      for (const res of [result.right, result.wrong, result.garbage]) {
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, ERROR_CODES.PASSWORD_LOGIN_DISABLED);
        assert.equal(res.headers['set-cookie'], undefined);
      }
      assert.deepEqual(
        lines.filter((line) => line.startsWith('eunomia event=AUTH_')),
        [],
        'no audit line for a closed door',
      );

      const options = await request(app).get('/api/v1/login-options');
      assert.deepEqual(options.body.data, { password: false, oidc: { label: null } });
    });

    await t.test('PASSWORD_LOGIN_FORCE opens the door without touching the switch', async () => {
      const { admin } = await bootstrapAdmin(app);
      await write({ 'login.oidcEnabled': true, 'login.passwordEnabled': false });

      const login = await request(forcedApp)
        .post('/api/v1/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });
      assert.equal(login.status, 200, JSON.stringify(login.body));

      const options = await request(forcedApp).get('/api/v1/login-options');
      assert.deepEqual(options.body.data, { password: true, oidc: { label: null } });

      // The admin contract says both, side by side.
      const forcedSnapshot = await request(forcedApp).get('/api/v1/settings').set(admin);
      assert.equal(forcedSnapshot.body.data.passwordLoginForced, true);
      const row = (
        forcedSnapshot.body.data.settings as Array<{ key: string; value: unknown }>
      ).find((entry) => entry.key === 'login.passwordEnabled');
      assert.equal(row?.value, false);
      assert.equal(await storedSwitch(), 'false');

      const plainSnapshot = await request(app).get('/api/v1/settings').set(admin);
      assert.equal(plainSnapshot.body.data.passwordLoginForced, false);
    });

    await t.test('the force is no door the form may count on', async () => {
      const { admin } = await bootstrapAdmin(forcedApp);
      const refused = await request(forcedApp)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'login.passwordEnabled': false } });
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error.code, ERROR_CODES.LOGIN_NO_WAY_IN);
    });
  } finally {
    await resetData(pool);
    await pool.end();
  }
});
