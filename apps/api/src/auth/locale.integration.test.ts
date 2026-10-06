import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { SETUP_TOKEN, openTestDatabase, resetData, testConfig } from '../test/harness.js';

test('own language and format', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const app = createApp({ pool, config: testConfig({ database }) });
    const admin = { email: 'admin@example.com', password: 'adminpass12', firstname: 'Ada' };
    await request(app).post('/api/v1/setup').set('X-Setup-Token', SETUP_TOKEN).send(admin);
    const login = await request(app).post('/api/v1/auth/login').send(admin);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };

    await t.test('a new user follows the defaults: both fields are null', async () => {
      assert.equal(login.body.user.locale, null);
      assert.equal(login.body.user.formatRegion, null);
      const me = await request(app).get('/api/v1/me').set(auth);
      assert.equal(me.body.user.locale, null);
      assert.equal(me.body.user.formatRegion, null);
    });

    await t.test('PATCH /me stores a choice and answers with the user', async () => {
      const res = await request(app)
        .patch('/api/v1/me')
        .set(auth)
        .send({ locale: 'en', formatRegion: 'de-DE' });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.locale, 'en');
      assert.equal(res.body.user.formatRegion, 'de-DE');
      assert.equal(res.body.user.email, admin.email);

      const me = await request(app).get('/api/v1/me').set(auth);
      assert.equal(me.body.user.locale, 'en');
    });

    await t.test('a field left out stays, null follows the defaults again', async () => {
      const res = await request(app).patch('/api/v1/me').set(auth).send({ formatRegion: null });
      assert.equal(res.body.user.locale, 'en');
      assert.equal(res.body.user.formatRegion, null);
    });

    await t.test('unknown languages, formats and fields are refused', async () => {
      for (const body of [
        { locale: 'fr' },
        { formatRegion: 'fr-FR' },
        { email: 'x@example.com' },
      ]) {
        const res = await request(app).patch('/api/v1/me').set(auth).send(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error.code, ERROR_CODES.VALIDATION_ERROR, JSON.stringify(body));
      }
    });

    await t.test('without a session there is nothing to change', async () => {
      const res = await request(app).patch('/api/v1/me').send({ locale: 'en' });
      assert.equal(res.status, 401);
    });
  } finally {
    await pool.end();
  }
});
