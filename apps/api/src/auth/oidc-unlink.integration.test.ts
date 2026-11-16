import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { setApplicationValues } from '../settings/repository.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';
import { captureLog, eventLines, singleEvent } from '../test/log-capture.js';

/**
 * Undoing a link to the sign-in provider (Slice 91): the flag in the user
 * list, the repair itself, and the lock on one's own link while the password
 * door is closed (blueprint, finding 6).
 *
 * `resetData` runs before and after every test, so a closed door never
 * outlives the test that closed it, and each test bootstraps its own admin
 * (blueprint, finding 8).
 */
test('user administration: undoing the link to the sign-in provider', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  const app = createApp({ pool, config: testConfig({ database }) });
  const forcedApp = createApp({
    pool,
    config: testConfig({ database, passwordLoginForce: true }),
  });

  /** Links a user the way a sign-in through the provider would have. */
  const link = (uuid: string, subject: string) =>
    pool.query('UPDATE Users SET oidcSubject = ? WHERE uuidText = ?', [subject, uuid]);
  const subjectOf = async (uuid: string): Promise<string | null> => {
    const rows = await pool.query<Array<{ oidcSubject: string | null }>>(
      'SELECT oidcSubject FROM Users WHERE uuidText = ?',
      [uuid],
    );
    return rows[0]?.oidcSubject ?? null;
  };
  /** The password door shut directly — the locks of the PUT are Slice 90's to test. */
  const closePasswordDoor = () =>
    setApplicationValues(
      pool,
      new Map([
        ['login.oidcEnabled', true],
        ['login.passwordEnabled', false],
      ]),
    );

  async function clerk(admin: Record<string, string>): Promise<string> {
    const created = await request(app)
      .post('/api/v1/users')
      .set(admin)
      .send({ email: 'clerk@example.com', firstname: 'Cleo', password: 'clerkpass1' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.data.uuid as string;
  }

  try {
    await runMigrations(pool);
    await resetData(pool);

    t.beforeEach(() => resetData(pool));
    t.afterEach(() => resetData(pool));

    await t.test('the list says which accounts are linked, never to what', async () => {
      const { admin } = await bootstrapAdmin(app);
      const clerkUuid = await clerk(admin);
      await link(clerkUuid, 'subject-of-cleo');

      const list = await request(app).get('/api/v1/users').set(admin);
      assert.equal(list.status, 200);
      const byEmail = new Map(
        (list.body.data as Array<{ email: string; oidcLinked: boolean }>).map((u) => [u.email, u]),
      );
      assert.equal(byEmail.get('clerk@example.com')?.oidcLinked, true);
      assert.equal(byEmail.get('admin@example.com')?.oidcLinked, false);
      assert.doesNotMatch(JSON.stringify(list.body), /subject-of-cleo/);
    });

    await t.test('an admin undoes a link: the subject goes, sessions stay', async () => {
      const { admin, uuid: adminUuid } = await bootstrapAdmin(app);
      const clerkUuid = await clerk(admin);
      await link(clerkUuid, 'subject-of-cleo');
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'clerk@example.com', password: 'clerkpass1' });
      assert.equal(login.status, 200);
      const sessions = async () =>
        (
          await pool.query<Array<{ n: number }>>(
            `SELECT COUNT(*) AS n FROM RefreshTokens t JOIN Users u ON u.userID = t.userID
              WHERE u.uuidText = ?`,
            [clerkUuid],
          )
        )[0]!.n;
      const before = Number(await sessions());

      const { result, lines } = await captureLog(() =>
        request(app).delete(`/api/v1/users/${clerkUuid}/oidc-link`).set(admin),
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.oidcLinked, false);
      assert.equal(await subjectOf(clerkUuid), null);
      assert.equal(Number(await sessions()), before, 'the sessions are left alone');

      const line = singleEvent(lines, 'AUTH_OIDC_UNLINKED');
      assert.ok(line, lines.join('\n'));
      assert.match(line, new RegExp(`actor=${adminUuid}`));
      assert.match(line, new RegExp(`user=${clerkUuid}`));
      assert.doesNotMatch(line, /subject-of-cleo/);
    });

    await t.test('undoing a link that is not there answers the user as it is', async () => {
      const { admin } = await bootstrapAdmin(app);
      const clerkUuid = await clerk(admin);

      const { result, lines } = await captureLog(() =>
        request(app).delete(`/api/v1/users/${clerkUuid}/oidc-link`).set(admin),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.data.oidcLinked, false);
      assert.deepEqual(eventLines(lines, 'AUTH_OIDC_UNLINKED'), [], 'nothing changed, no line');
    });

    await t.test('a deleted or unknown user is not found; a malformed id is 400', async () => {
      const { admin } = await bootstrapAdmin(app);
      const clerkUuid = await clerk(admin);
      await link(clerkUuid, 'subject-of-cleo');
      assert.equal(
        (await request(app).delete(`/api/v1/users/${clerkUuid}`).set(admin)).status,
        204,
      );

      const deleted = await request(app).delete(`/api/v1/users/${clerkUuid}/oidc-link`).set(admin);
      assert.equal(deleted.status, 404);
      assert.equal(await subjectOf(clerkUuid), 'subject-of-cleo');

      const unknown = await request(app)
        .delete('/api/v1/users/00000000-0000-4000-8000-000000000000/oidc-link')
        .set(admin);
      assert.equal(unknown.status, 404);
      assert.equal(
        (await request(app).delete('/api/v1/users/not-a-uuid/oidc-link').set(admin)).status,
        400,
      );
    });

    await t.test('without MANAGE_USERS the link stays', async () => {
      const { admin, uuid: adminUuid } = await bootstrapAdmin(app);
      await clerk(admin);
      await link(adminUuid, 'subject-of-ada');
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'clerk@example.com', password: 'clerkpass1' });
      const asClerk = { Authorization: `Bearer ${login.body.accessToken}` };

      const refused = await request(app)
        .delete(`/api/v1/users/${adminUuid}/oidc-link`)
        .set(asClerk);
      assert.equal(refused.status, 403);
      assert.equal(await subjectOf(adminUuid), 'subject-of-ada');
    });

    await t.test('one’s own link: free while the password door is open', async () => {
      const { admin, uuid: adminUuid } = await bootstrapAdmin(app);
      await link(adminUuid, 'subject-of-ada');

      const own = await request(app).delete(`/api/v1/users/${adminUuid}/oidc-link`).set(admin);
      assert.equal(own.status, 200, JSON.stringify(own.body));
      assert.equal(await subjectOf(adminUuid), null);
    });

    await t.test('one’s own link: locked while the door is closed, not others’', async () => {
      const { admin, uuid: adminUuid } = await bootstrapAdmin(app);
      const clerkUuid = await clerk(admin);
      await link(adminUuid, 'subject-of-ada');
      await link(clerkUuid, 'subject-of-cleo');
      await closePasswordDoor();

      const own = await request(app).delete(`/api/v1/users/${adminUuid}/oidc-link`).set(admin);
      assert.equal(own.status, 409);
      assert.equal(own.body.error.code, ERROR_CODES.SELF_UNLINK_LOCKED);
      assert.equal(await subjectOf(adminUuid), 'subject-of-ada');

      // Another account's link stays repairable: its owner is not the one who
      // would be locked out, and the admin still is linked.
      const other = await request(app).delete(`/api/v1/users/${clerkUuid}/oidc-link`).set(admin);
      assert.equal(other.status, 200);
      assert.equal(await subjectOf(clerkUuid), null);
    });

    await t.test('PASSWORD_LOGIN_FORCE opens the lock like it opens the door', async () => {
      const { admin, uuid: adminUuid } = await bootstrapAdmin(app);
      await link(adminUuid, 'subject-of-ada');
      await closePasswordDoor();

      const own = await request(forcedApp)
        .delete(`/api/v1/users/${adminUuid}/oidc-link`)
        .set(admin);
      assert.equal(own.status, 200, JSON.stringify(own.body));
      assert.equal(await subjectOf(adminUuid), null);
    });
  } finally {
    await pool.end();
  }
});
