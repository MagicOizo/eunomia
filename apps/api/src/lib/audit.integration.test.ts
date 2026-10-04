import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { runMigrations } from '../db/migrate.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';
import { captureLog, eventLines, singleEvent } from '../test/log-capture.js';

/** The `refresh_token=…` pair out of a Set-Cookie header, without its attributes. */
function refreshCookie(setCookie: unknown): string {
  const headers = (Array.isArray(setCookie) ? setCookie : [setCookie]).map(String);
  return headers.find((one) => one.startsWith('refresh_token='))?.split(';')[0] ?? '';
}

/**
 * The audit trail over HTTP (SEC-09). `audit.test.ts` holds the shape of a
 * line; this holds that the line is actually written — by the real route, on
 * the real refusal, with the real UIDs in it.
 *
 * Both halves are needed, and the second one is the finding: the format was
 * never the problem, the silence was.
 */
test('audit: the whole trail is written by the real routes', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });

    /** Runs one request with the log captured, and hands back both. */
    async function logged<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
      return captureLog(run);
    }

    let admin: Record<string, string> = {};
    let adminUuid = '';

    await t.test('setup writes the one line that may only ever appear once', async () => {
      const { result, lines } = await logged(() => bootstrapAdmin(app));
      admin = result.admin;
      adminUuid = result.uuid;

      const setup = singleEvent(lines, 'AUTH_SETUP_COMPLETED');
      assert.ok(setup, 'setup should write exactly one line');
      assert.match(setup, new RegExp(`user=${adminUuid}`));
      assert.match(setup, /email=admin@example\.com/);
      // bootstrapAdmin logs in straight after, so the pair is here together.
      assert.ok(singleEvent(lines, 'AUTH_LOGIN_OK')?.includes(`user=${adminUuid}`));
    });

    await t.test('a failed login says why, without telling the caller', async () => {
      const { result: wrong, lines: wrongLines } = await logged(() =>
        request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'admin@example.com', password: 'not-the-password' }),
      );
      assert.equal(wrong.status, 401);
      assert.match(singleEvent(wrongLines, 'AUTH_LOGIN_FAILED') ?? '', /reason=bad_password/);

      const { result: unknown, lines: unknownLines } = await logged(() =>
        request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'nobody@example.org', password: 'not-the-password' }),
      );
      assert.equal(unknown.status, 401);
      // Same answer to the caller, different line in the log — that is the
      // whole point of telling the reasons apart.
      assert.equal(unknown.body.error.code, wrong.body.error.code);
      const line = singleEvent(unknownLines, 'AUTH_LOGIN_FAILED') ?? '';
      assert.match(line, /reason=unknown_user/);
      assert.match(line, /email=nobody@example\.org/);
    });

    await t.test('a missing or forged token is logged, an expired one is not', async () => {
      const { lines: noneLines } = await logged(() => request(app).get('/api/v1/me'));
      assert.match(singleEvent(noneLines, 'AUTH_UNAUTHENTICATED') ?? '', /reason=no_token/);

      const { lines: forgedLines } = await logged(() =>
        request(app).get('/api/v1/me').set({ Authorization: 'Bearer not-a-jwt' }),
      );
      const forged = singleEvent(forgedLines, 'AUTH_UNAUTHENTICATED') ?? '';
      assert.match(forged, /reason=invalid_token/);
      assert.match(forged, /method=GET path=\/api\/v1\/me/);

      // The decision that makes the trail readable: an access token that has
      // simply aged out is the normal end of every fifteen minutes in every
      // open tab, and writes nothing at all.
      const expired = await signAccessToken(adminUuid, config.auth.jwtSecret, -60);
      const { result, lines: expiredLines } = await logged(() =>
        request(app)
          .get('/api/v1/me')
          .set({ Authorization: `Bearer ${expired}` }),
      );
      assert.equal(result.status, 401);
      assert.deepEqual(eventLines(expiredLines, 'AUTH_UNAUTHENTICATED'), []);
    });

    let plainUuid = '';
    let plainToken = '';

    await t.test('creating and updating a user is on the record', async () => {
      const { result: created, lines: createdLines } = await logged(() =>
        request(app).post('/api/v1/users').set(admin).send({
          email: 'plain@example.com',
          firstname: 'Pia',
          password: 'plainpass1',
        }),
      );
      assert.equal(created.status, 201);
      plainUuid = created.body.data.uuid as string;
      const createdLine = singleEvent(createdLines, 'USER_CREATED') ?? '';
      assert.match(createdLine, new RegExp(`actor=${adminUuid}`));
      assert.match(createdLine, new RegExp(`user=${plainUuid}`));

      const { lines: patchLines } = await logged(() =>
        request(app)
          .patch(`/api/v1/users/${plainUuid}`)
          .set(admin)
          .send({ firstname: 'Pialein', password: 'newplainpass1' }),
      );
      const patched = singleEvent(patchLines, 'USER_UPDATED') ?? '';
      assert.match(patched, /fields=firstname,password/);
      // The name of the field, never the new password itself.
      assert.equal(patched.includes('newplainpass1'), false);

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'plain@example.com', password: 'newplainpass1' });
      assert.equal(login.status, 200);
      plainToken = login.body.accessToken as string;
    });

    await t.test('a role change records the whole new set', async () => {
      const roles = await request(app).get('/api/v1/roles').set(admin);
      const nutzer = (roles.body.data as Array<{ roleUID: string; roleName: string }>).find(
        (role) => role.roleName === 'Nutzer',
      );
      assert.ok(nutzer, 'the migrations ship a "Nutzer" role');

      const { result, lines } = await logged(() =>
        request(app)
          .put(`/api/v1/users/${plainUuid}/global-roles`)
          .set(admin)
          .send({ roleUIDs: [nutzer.roleUID] }),
      );
      assert.equal(result.status, 200);
      const line = singleEvent(lines, 'USER_ROLES_CHANGED') ?? '';
      assert.match(line, /scope=global count=1/);
      assert.match(line, new RegExp(`roles=${nutzer.roleUID}`));
    });

    await t.test('a refused request names the permission it wanted', async () => {
      const { result, lines } = await logged(() =>
        request(app)
          .get('/api/v1/users')
          .set({ Authorization: `Bearer ${plainToken}` }),
      );
      assert.equal(result.status, 403);
      const line = singleEvent(lines, 'AUTH_FORBIDDEN') ?? '';
      assert.match(line, new RegExp(`user=${plainUuid}`));
      assert.match(line, /permission=MANAGE_USERS/);
      assert.match(line, /method=GET path=\/api\/v1\/users/);
    });

    await t.test('the trash records what came back and what is gone', async () => {
      const created = await request(app)
        .post('/api/v1/facilities')
        .set(admin)
        .send({ facilityName: 'Praxis Protokoll' });
      assert.equal(created.status, 201);
      const uid = created.body.data.facilityUID as string;
      await request(app).delete(`/api/v1/facilities/${uid}`).set(admin);

      const { lines: backLines } = await logged(() =>
        request(app).post(`/api/v1/trash/${uid}/restore`).set(admin),
      );
      const restored = singleEvent(backLines, 'TRASH_RESTORED') ?? '';
      assert.match(restored, new RegExp(`kind=facility uid=${uid} alsoRestored=0`));

      await request(app).delete(`/api/v1/facilities/${uid}`).set(admin);
      const { result, lines: goneLines } = await logged(() =>
        request(app).delete(`/api/v1/trash/${uid}`).set(admin),
      );
      assert.equal(result.status, 204);
      const purged = singleEvent(goneLines, 'TRASH_PURGED') ?? '';
      assert.match(purged, new RegExp(`actor=${adminUuid} kind=facility uid=${uid}`));
      // The label would be the record's name; the line carries the UID instead.
      assert.equal(purged.includes('Praxis Protokoll'), false);
    });

    await t.test('a settings change names the keys and not the password', async () => {
      const { result, lines } = await logged(() =>
        request(app)
          .put('/api/v1/settings')
          .set(admin)
          .send({ values: { 'mail.host': 'smtp.example.com', 'mail.fromName': null } }),
      );
      assert.equal(result.status, 200);
      const line = singleEvent(lines, 'SETTINGS_CHANGED') ?? '';
      assert.match(line, /set=mail\.host/);
      assert.match(line, /cleared=mail\.fromName/);
      // The value of the one key that was written does not appear either: the
      // rule is keys only, and a host is still not a key.
      assert.equal(line.includes('smtp.example.com'), false);
    });

    await t.test('changing a password and logging out close the session trail', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'plain@example.com', password: 'newplainpass1' });
      const cookie = refreshCookie(login.headers['set-cookie']);

      const { lines: pwLines } = await logged(() =>
        request(app)
          .post('/api/v1/auth/password')
          .set({ Authorization: `Bearer ${login.body.accessToken}` })
          .set('Cookie', cookie)
          .send({ currentPassword: 'newplainpass1', newPassword: 'thirdpass12' }),
      );
      const changed = singleEvent(pwLines, 'AUTH_PASSWORD_CHANGED') ?? '';
      assert.match(changed, new RegExp(`user=${plainUuid}`));
      assert.match(changed, /sessionsEnded=\d+/);
      assert.equal(changed.includes('thirdpass12'), false);

      const { lines: outLines } = await logged(() =>
        request(app).post('/api/v1/auth/logout').set('Cookie', cookie),
      );
      assert.match(singleEvent(outLines, 'AUTH_LOGOUT') ?? '', new RegExp(`user=${plainUuid}`));
    });

    // Last, because a soft-deleted user cannot be brought back through the
    // admin API: `updateUser` ends on `AND userStatus <> -1`.
    await t.test('deactivating a user is a warning of its own', async () => {
      const { result, lines } = await logged(() =>
        request(app).delete(`/api/v1/users/${plainUuid}`).set(admin),
      );
      assert.equal(result.status, 204);
      const line = singleEvent(lines, 'USER_DEACTIVATED') ?? '';
      assert.match(line, new RegExp(`actor=${adminUuid} user=${plainUuid}`));
      assert.match(line, /level=warn/);
    });
  } finally {
    await pool.end();
  }
});
