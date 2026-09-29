import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { generateEntityId } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';

/**
 * End-to-end auth flow against a real MariaDB. Skips when no DB is configured,
 * so `npm test` stays runnable locally without one; CI provides a database.
 */

function databaseConfigFromEnv(): DatabaseConfig | null {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return null;
  return {
    host: DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
}

const SETUP_TOKEN = 'test-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'test-secret-please-ignore',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      setupToken: SETUP_TOKEN,
    },
    trustProxy: 1,
    rateLimit: { authMax: 100000, authWindowMs: 60000, globalMax: 100000, globalWindowMs: 60000 },
    // Disabled so no test ever reaches out to GitHub.
    updateCheck: {
      enabled: false,
      repository: 'MagicOizo/eunomia',
      token: undefined,
      cacheTtlMs: 0,
    },
    // No encryption key: these suites store no secrets.
    configEncryptionKey: null,
  };
}

/** Removes all user/session data so the suite is repeatable on a shared DB. */
async function resetAuthData(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM RefreshTokens');
  await pool.query('DELETE FROM UserAccountRoles');
  await pool.query('DELETE FROM UserRoles');
  await pool.query('DELETE FROM Users');
}

/** Pulls the refresh_token value out of a Set-Cookie header (string or array). */
function refreshCookieValue(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const header = cookies.find((c) => c.startsWith('refresh_token='));
  return header?.split(';')[0]?.split('=')[1];
}

test('auth flow: setup, login, protected access, scoping, refresh, logout', async (t) => {
  const database = databaseConfigFromEnv();
  if (!database) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }

  const pool = createPool(database);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  try {
    await runMigrations(pool);
    await resetAuthData(pool);

    const config = testConfig(database);
    const app = createApp({ pool, config });
    const adminCreds = { email: 'admin@example.com', password: 'supersecret1', firstname: 'Ada' };

    await t.test('setup rejects a wrong/absent setup token', async () => {
      const noToken = await request(app).post('/api/v1/setup').send(adminCreds);
      assert.equal(noToken.status, 403);
      assert.equal(noToken.body.error.code, 'INVALID_SETUP_TOKEN');

      const wrong = await request(app)
        .post('/api/v1/setup')
        .set('X-Setup-Token', 'nope')
        .send(adminCreds);
      assert.equal(wrong.status, 403);
    });

    await t.test('setup creates the first admin with the right token', async () => {
      const res = await request(app)
        .post('/api/v1/setup')
        .set('X-Setup-Token', SETUP_TOKEN)
        .send(adminCreds);
      assert.equal(res.status, 201);
      assert.match(res.body.user.uuid, /^[0-9a-f-]{36}$/);
      assert.equal(res.body.user.email, adminCreds.email);
    });

    await t.test('setup is single-use (second attempt conflicts)', async () => {
      const res = await request(app)
        .post('/api/v1/setup')
        .set('X-Setup-Token', SETUP_TOKEN)
        .send(adminCreds);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SETUP_ALREADY_DONE');
    });

    let adminToken = '';

    await t.test('login rejects wrong password, accepts correct one', async () => {
      const bad = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: adminCreds.email, password: 'wrong' });
      assert.equal(bad.status, 401);
      assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');

      const ok = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: adminCreds.email, password: adminCreds.password });
      assert.equal(ok.status, 200);
      assert.ok(ok.body.accessToken);
      assert.ok(refreshCookieValue(ok.headers['set-cookie']));
      adminToken = ok.body.accessToken;
    });

    await t.test('GET /me needs a token and reports admin permissions', async () => {
      const anon = await request(app).get('/api/v1/me');
      assert.equal(anon.status, 401);

      const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${adminToken}`);
      assert.equal(me.status, 200);
      assert.ok(me.body.permissions.global.includes('MANAGE_USERS'));
      assert.ok(me.body.permissions.global.includes('VIEW_INVOICES'));
      // SETUP_TOKEN is set in this config, so the admin is warned it is still open.
      assert.equal(me.body.setupTokenActive, true);
    });

    await t.test('/me reports setupTokenActive false when no SETUP_TOKEN is set', async () => {
      // Same jwtSecret, so the admin's token stays valid on this second app.
      const noSetup = createApp({
        pool,
        config: { ...config, auth: { ...config.auth, setupToken: undefined } },
      });
      const me = await request(noSetup)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(me.status, 200);
      assert.equal(me.body.setupTokenActive, false);
    });

    await t.test('admin passes the global-permission guard', async () => {
      // GET /users is gated globally on MANAGE_USERS (auth/admin-routes.ts),
      // so reaching it is the proof that the global guard lets an admin past.
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });

    // A non-admin user with the Nutzer role scoped to exactly one account.
    const grantedAccount = generateEntityId('account');
    const otherAccount = generateEntityId('account');
    const userCreds = { email: 'user@example.com', password: 'userpass12' };
    let userToken = '';

    await t.test('set up an account-scoped Nutzer and verify scoping', async () => {
      await pool.query('INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES (?, ?, ?)', [
        grantedAccount,
        'Klaus',
        '1990-01-01',
      ]);
      const insert = (await pool.query(
        'INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)',
        [userCreds.email, 'Uwe', await hashPassword(userCreds.password)],
      )) as { insertId: number };
      const nutzer = (
        await pool.query<Array<{ roleID: number }>>(
          "SELECT roleID FROM Roles WHERE roleName = 'Nutzer'",
        )
      )[0];
      assert.ok(nutzer);
      await pool.query(
        'INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)',
        [insert.insertId, nutzer.roleID, grantedAccount],
      );

      const login = await request(app).post('/api/v1/auth/login').send(userCreds);
      assert.equal(login.status, 200);
      userToken = login.body.accessToken;

      // Granted account: allowed. Other account: forbidden (the guard answers
      // before the handler, so the missing row never comes into it). Globally
      // gated route: forbidden.
      const granted = await request(app)
        .get(`/api/v1/accounts/${grantedAccount}`)
        .set('Authorization', `Bearer ${userToken}`);
      assert.equal(granted.status, 200);
      assert.equal(granted.body.data.accountUID, grantedAccount);

      const denied = await request(app)
        .get(`/api/v1/accounts/${otherAccount}`)
        .set('Authorization', `Bearer ${userToken}`);
      assert.equal(denied.status, 403);

      const adminOnly = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`);
      assert.equal(adminOnly.status, 403);
    });

    await t.test('refresh rotates the token and the old one stops working', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: adminCreds.email, password: adminCreds.password });
      const firstCookie = refreshCookieValue(login.headers['set-cookie']);
      assert.ok(firstCookie);

      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${firstCookie}`);
      assert.equal(rotated.status, 200);
      assert.ok(rotated.body.accessToken);

      // Reusing the pre-rotation token must fail (it was revoked on first use).
      const reused = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${firstCookie}`);
      assert.equal(reused.status, 401);

      // Logout revokes the current (rotated) token.
      const newCookie = refreshCookieValue(rotated.headers['set-cookie']);
      const loggedOut = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `refresh_token=${newCookie}`);
      assert.equal(loggedOut.status, 204);

      const afterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${newCookie}`);
      assert.equal(afterLogout.status, 401);
    });

    await t.test('the auth endpoints are rate limited', async () => {
      const strict = createApp({
        pool,
        config: { ...config, rateLimit: { ...config.rateLimit, authMax: 3, authWindowMs: 60_000 } },
      });
      let lastStatus = 0;
      for (let i = 0; i < 5; i += 1) {
        lastStatus = (
          await request(strict)
            .post('/api/v1/auth/login')
            .send({ email: 'x@example.com', password: 'nope' })
        ).status;
      }
      assert.equal(lastStatus, 429); // over the 3-per-window limit
    });
  } finally {
    await pool.end();
  }
});
