import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

const ENCRYPTION_KEY = randomBytes(32);

interface PublicSettingRow {
  key: string;
  value: unknown;
  isSecret: boolean;
  isSet: boolean;
  readonly: boolean;
}

/** Looks one setting up in the API's answer, failing loudly when it is absent. */
function setting(body: { data: { settings: PublicSettingRow[] } }, key: string): PublicSettingRow {
  const row = body.data.settings.find((entry) => entry.key === key);
  assert.ok(row, `setting ${key} missing from the response`);
  return row;
}

test('system settings: gating, write cases, encryption at rest, mail status', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const app = createApp({
      pool,
      config: testConfig({ database, configEncryptionKey: ENCRYPTION_KEY }),
    });

    // Bootstrap admin, plus a plain user for the permission check.
    const { admin } = await bootstrapAdmin(app);

    const roles = (await request(app).get('/api/v1/roles').set(admin)).body.data as Array<{
      roleUID: string;
      roleName: string;
    }>;
    const nutzerRole = roles.find((r) => r.roleName === 'Nutzer');
    assert.ok(nutzerRole);
    const clerk = (
      await request(app).post('/api/v1/users').set(admin).send({
        email: 'clerk@example.com',
        password: 'clerkpass1',
        firstname: 'Cleo',
      })
    ).body.data as { uuid: string };
    await request(app)
      .put(`/api/v1/users/${clerk.uuid}/roles`)
      .set(admin)
      .send({ roleUIDs: [nutzerRole.roleUID] });
    const clerkLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'clerk@example.com', password: 'clerkpass1' });
    const user = { Authorization: `Bearer ${clerkLogin.body.accessToken}` };

    await t.test('only MANAGE_SETTINGS may read, write or test', async () => {
      assert.equal((await request(app).get('/api/v1/settings')).status, 401);
      assert.equal((await request(app).get('/api/v1/settings').set(user)).status, 403);
      assert.equal(
        (await request(app).put('/api/v1/settings').set(user).send({ values: {} })).status,
        403,
      );
      assert.equal((await request(app).post('/api/v1/settings/mail/test').set(user)).status, 403);
      // The update check shares the permission and gained a refresh endpoint.
      assert.equal((await request(app).post('/api/v1/update-check/refresh').set(user)).status, 403);
    });

    await t.test('a fresh instance reports defaults, nothing set, and a usable key', async () => {
      const res = await request(app).get('/api/v1/settings').set(admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.encryptionAvailable, true);
      assert.deepEqual(res.body.data.mailStatus, {
        lastSendAt: null,
        lastSendResult: null,
        lastSendError: null,
      });
      assert.equal(setting(res.body, 'mail.port').value, 587);
      assert.equal(setting(res.body, 'mail.enabled').value, false);
      assert.equal(setting(res.body, 'mail.password').isSecret, true);
      assert.equal(setting(res.body, 'mail.password').isSet, false);
      assert.equal(setting(res.body, 'mail.lastSendAt').readonly, true);
    });

    await t.test('writing the mail configuration stores values and hides the secret', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({
          values: {
            'mail.enabled': true,
            'mail.host': '  smtp.example.com ',
            'mail.port': 465,
            'mail.secure': true,
            'mail.user': 'eunomia@example.com',
            'mail.password': 'hunter2',
            'mail.fromAddress': 'eunomia@example.com',
            'mail.fromName': 'Eunomia Test',
          },
        });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(setting(res.body, 'mail.host').value, 'smtp.example.com', 'trimmed');
      assert.equal(setting(res.body, 'mail.port').value, 465);
      assert.equal(setting(res.body, 'mail.secure').value, true);
      // The password is acknowledged as set, but never echoed.
      assert.equal(setting(res.body, 'mail.password').isSet, true);
      assert.equal(setting(res.body, 'mail.password').value, null);
      assert.equal(JSON.stringify(res.body).includes('hunter2'), false);
    });

    await t.test('the stored secret is encrypted, not plaintext', async () => {
      const rows = await pool.query<Array<{ settingValue: string | null }>>(
        'SELECT settingValue FROM SystemSettings WHERE settingKey = ?',
        ['mail.password'],
      );
      const stored = rows[0]?.settingValue ?? '';
      assert.match(stored, /^aes-256-gcm\$/);
      assert.equal(stored.includes('hunter2'), false);
    });

    await t.test('the write is attributed to the admin who made it', async () => {
      const rows = await pool.query<Array<{ email: string | null }>>(
        `SELECT u.email FROM SystemSettings s
           LEFT JOIN Users u ON u.userID = s.updatedByUserID
          WHERE s.settingKey = ?`,
        ['mail.host'],
      );
      assert.equal(rows[0]?.email, 'admin@example.com');
    });

    await t.test('unknown, readonly and malformed writes are refused by code', async () => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ 'mail.hostname': 'smtp.example.com' }, ERROR_CODES.SETTING_UNKNOWN],
        [{ 'mail.lastSendResult': 'ok' }, ERROR_CODES.SETTING_READONLY],
        [{ 'mail.port': 70000 }, ERROR_CODES.SETTING_INVALID_VALUE],
        [{ 'mail.enabled': 'true' }, ERROR_CODES.SETTING_INVALID_VALUE],
      ];
      for (const [values, code] of cases) {
        const res = await request(app).put('/api/v1/settings').set(admin).send({ values });
        assert.equal(res.status, 400, JSON.stringify(values));
        assert.equal(res.body.error.code, code, JSON.stringify(values));
      }
    });

    await t.test('a failed send is recorded and reported, not swallowed', async () => {
      // Port 1 on localhost refuses at once: the failure path without a wait.
      await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'mail.host': '127.0.0.1', 'mail.port': 1, 'mail.secure': false } });

      const res = await request(app).post('/api/v1/settings/mail/test').set(admin);
      assert.equal(res.status, 502, JSON.stringify(res.body));
      assert.equal(res.body.error.code, ERROR_CODES.MAIL_SEND_FAILED);

      const after = await request(app).get('/api/v1/settings').set(admin);
      assert.equal(after.body.data.mailStatus.lastSendResult, 'error');
      assert.ok(after.body.data.mailStatus.lastSendAt);
      assert.ok(after.body.data.mailStatus.lastSendError);
    });

    await t.test('switching mail off reports "not configured" without an attempt', async () => {
      await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'mail.enabled': false } });

      const res = await request(app).post('/api/v1/settings/mail/test').set(admin);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, ERROR_CODES.MAIL_NOT_CONFIGURED);
      // The recorded status still describes the last real attempt.
      const after = await request(app).get('/api/v1/settings').set(admin);
      assert.equal(after.body.data.mailStatus.lastSendResult, 'error');
    });

    await t.test('null forgets a stored secret', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'mail.password': null } });
      assert.equal(setting(res.body, 'mail.password').isSet, false);

      const rows = await pool.query<Array<{ settingValue: string | null }>>(
        'SELECT settingValue FROM SystemSettings WHERE settingKey = ?',
        ['mail.password'],
      );
      assert.equal(rows.length, 0, 'the row is deleted, not blanked');
    });

    await t.test('without CONFIG_ENCRYPTION_KEY a secret cannot be stored', async () => {
      const keyless = createApp({ pool, config: testConfig({ database }) });
      const login = await request(keyless)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'adminpass1' });
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };

      const read = await request(keyless).get('/api/v1/settings').set(auth);
      assert.equal(read.body.data.encryptionAvailable, false);

      const res = await request(keyless)
        .put('/api/v1/settings')
        .set(auth)
        .send({ values: { 'mail.password': 'hunter2' } });
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.error.code, ERROR_CODES.SETTINGS_ENCRYPTION_UNAVAILABLE);

      // A non-secret setting still works without the key.
      const ok = await request(keyless)
        .put('/api/v1/settings')
        .set(auth)
        .send({ values: { 'mail.fromName': 'Ohne Schlüssel' } });
      assert.equal(ok.status, 200);
    });
  } finally {
    await pool.end();
  }
});
