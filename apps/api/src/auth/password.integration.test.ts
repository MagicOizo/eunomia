import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { cleanupRefreshTokens } from './cleanup.js';
import { SETUP_TOKEN, openTestDatabase, resetData, testConfig } from '../test/harness.js';

/** Pulls the refresh_token value out of a Set-Cookie header (string or array). */
function refreshCookieValue(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const header = cookies.find((c) => c.startsWith('refresh_token='));
  return header?.split(';')[0]?.split('=')[1];
}

test('passwords and sessions', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });

    const admin = { email: 'admin@example.com', password: 'adminpass12', firstname: 'Ada' };
    const user = { email: 'user@example.com', password: 'userpass12' };

    /** Logs in and returns the access token plus the refresh cookie of that session. */
    async function openSession(creds: {
      email: string;
      password: string;
    }): Promise<{ accessToken: string; cookie: string }> {
      const res = await request(app).post('/api/v1/auth/login').send(creds);
      assert.equal(res.status, 200);
      const cookie = refreshCookieValue(res.headers['set-cookie']);
      assert.ok(cookie);
      return { accessToken: res.body.accessToken as string, cookie };
    }

    /** Whether that refresh cookie can still be exchanged for a session. */
    async function refreshWorks(cookie: string): Promise<boolean> {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${cookie}`);
      return res.status === 200;
    }

    /** The caller's own UUID, read back from /me. */
    async function ownUuid(accessToken: string): Promise<string> {
      const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
      assert.equal(me.status, 200);
      return me.body.user.uuid as string;
    }

    await request(app).post('/api/v1/setup').set('X-Setup-Token', SETUP_TOKEN).send(admin);
    const adminSession = await openSession(admin);

    let userUuid = '';
    await t.test('an admin creates the user this suite works with', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminSession.accessToken}`)
        .send({ email: user.email, firstname: 'Uwe', password: user.password });
      assert.equal(res.status, 201);
      userUuid = res.body.data.uuid as string;
    });

    await t.test('POST /auth/password needs a token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/password')
        .send({ currentPassword: user.password, newPassword: 'brandnew123' });
      assert.equal(res.status, 401);
    });

    await t.test('the old password is required, and the new one has a minimum', async () => {
      const session = await openSession(user);

      const wrong = await request(app)
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', `refresh_token=${session.cookie}`)
        .send({ currentPassword: 'not-the-one', newPassword: 'brandnew123' });
      // 403, not 401: the caller is authenticated, only the proof is wrong.
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, 'INVALID_CURRENT_PASSWORD');

      const short = await request(app)
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Cookie', `refresh_token=${session.cookie}`)
        .send({ currentPassword: user.password, newPassword: 'short' });
      assert.equal(short.status, 400);
      assert.equal(short.body.error.code, 'VALIDATION_ERROR');

      // Neither attempt changed anything.
      assert.ok(await refreshWorks(session.cookie));
    });

    const selfChanged = 'selfchosen123';

    await t.test('a successful change keeps this session and ends the others', async () => {
      const here = await openSession(user);
      const elsewhere = await openSession(user);

      const res = await request(app)
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${here.accessToken}`)
        .set('Cookie', `refresh_token=${here.cookie}`)
        .send({ currentPassword: user.password, newPassword: selfChanged });
      assert.equal(res.status, 204);

      // The other browser is out. This order is the point of the case: the
      // ended session is deleted, not revoked, so its attempt is a plain
      // refusal. Were it revoked, the reuse detection would read it as a theft
      // and take down the session the change just spared — which is asserted
      // right after it.
      assert.equal(await refreshWorks(elsewhere.cookie), false);
      assert.ok(await refreshWorks(here.cookie));
    });

    await t.test('the new password works and the old one does not', async () => {
      const old = await request(app).post('/api/v1/auth/login').send(user);
      assert.equal(old.status, 401);

      const fresh = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: selfChanged });
      assert.equal(fresh.status, 200);
    });

    const adminSet = 'adminchosen123';

    await t.test("an admin's password reset ends every session of that user", async () => {
      const session = await openSession({ email: user.email, password: selfChanged });
      // Proof the session is live, holding on to the token it rotates to —
      // asking again with the pre-rotation one would be a reuse, and then this
      // case would be testing that instead of the reset.
      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${session.cookie}`);
      assert.equal(rotated.status, 200);
      const liveCookie = refreshCookieValue(rotated.headers['set-cookie']);
      assert.ok(liveCookie);

      const res = await request(app)
        .patch(`/api/v1/users/${userUuid}`)
        .set('Authorization', `Bearer ${adminSession.accessToken}`)
        .send({ password: adminSet });
      assert.equal(res.status, 200);

      assert.equal(await refreshWorks(liveCookie), false);
      const fresh = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: adminSet });
      assert.equal(fresh.status, 200);
    });

    await t.test('an admin cannot set their own password through the user API', async () => {
      const res = await request(app)
        .patch(`/api/v1/users/${await ownUuid(adminSession.accessToken)}`)
        .set('Authorization', `Bearer ${adminSession.accessToken}`)
        .send({ password: 'adminnewpass12' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'SELF_ACCOUNT_ACTION');

      // Unchanged: the old one still logs in.
      const login = await request(app).post('/api/v1/auth/login').send(admin);
      assert.equal(login.status, 200);
    });

    await t.test('a reused refresh token brings down the whole chain', async () => {
      const stolen = await openSession({ email: user.email, password: adminSet });
      const other = await openSession({ email: user.email, password: adminSet });

      // The legitimate client rotates once.
      const rotated = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${stolen.cookie}`);
      assert.equal(rotated.status, 200);
      const rotatedCookie = refreshCookieValue(rotated.headers['set-cookie']);
      assert.ok(rotatedCookie);

      // Someone shows the pre-rotation token a second time. That is the one
      // reliable sign of a stolen token (SEC-07).
      const reused = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${stolen.cookie}`);
      assert.equal(reused.status, 401);
      assert.equal(reused.body.error.code, 'INVALID_REFRESH_TOKEN');

      // Not just that one request: every session of this user is gone, the
      // freshly rotated one included.
      assert.equal(await refreshWorks(rotatedCookie), false);
      assert.equal(await refreshWorks(other.cookie), false);
    });

    await t.test('the sweep removes what is past all use and nothing else', async () => {
      await pool.query('DELETE FROM RefreshTokens');
      const owner = (
        await pool.query<Array<{ userID: number }>>('SELECT userID FROM Users WHERE email = ?', [
          user.email,
        ])
      )[0];
      assert.ok(owner);

      const retentionMs = config.auth.refreshTokenTtlSeconds * 1000;
      const now = new Date();
      const hoursAgo = (hours: number): Date => new Date(now.getTime() - hours * 3600_000);
      const daysAhead = (days: number): Date => new Date(now.getTime() + days * 86_400_000);

      const rows: Array<[string, Date, Date | null]> = [
        // Goes: expired, never revoked.
        ['a'.repeat(64), hoursAgo(1), null],
        // Goes: revoked longer ago than one refresh lifetime.
        ['b'.repeat(64), daysAhead(1), hoursAgo(config.auth.refreshTokenTtlSeconds / 3600 + 1)],
        // Stays: revoked, but still inside the detection window of SEC-07.
        ['c'.repeat(64), daysAhead(1), new Date(now.getTime() - 1000)],
        // Stays: a live session.
        ['d'.repeat(64), daysAhead(1), null],
      ];
      for (const [tokenHash, expiresAt, revokedAt] of rows) {
        await pool.query(
          'INSERT INTO RefreshTokens (userID, tokenHash, expiresAt, revokedAt) VALUES (?, ?, ?, ?)',
          [owner.userID, tokenHash, expiresAt, revokedAt],
        );
      }

      assert.equal(await cleanupRefreshTokens(pool, { retentionMs }), 2);
      const left = await pool.query<Array<{ tokenHash: string }>>(
        'SELECT tokenHash FROM RefreshTokens ORDER BY tokenHash',
      );
      assert.deepEqual(
        left.map((r) => r.tokenHash[0]),
        ['c', 'd'],
      );

      // Idempotent: a second sweep finds nothing left to do.
      assert.equal(await cleanupRefreshTokens(pool, { retentionMs }), 0);
    });

    await t.test('/auth/password sits behind the strict auth rate limit', async () => {
      const strict = createApp({
        pool,
        config: { ...config, rateLimit: { ...config.rateLimit, authMax: 3, authWindowMs: 60_000 } },
      });
      const session = await openSession({ email: user.email, password: adminSet });
      let last: request.Response | undefined;
      for (let i = 0; i < 5; i += 1) {
        last = await request(strict)
          .post('/api/v1/auth/password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({ currentPassword: 'guessing', newPassword: 'whatever12345' });
      }
      assert.equal(last?.status, 429);
      // English with a code, like every other API error — the web translates it.
      assert.deepEqual(last?.body, {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      });
    });
  } finally {
    await pool.end();
  }
});
