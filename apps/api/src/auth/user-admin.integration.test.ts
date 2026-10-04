import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

test('admin user/role management: DoD flow, gating, guards', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });

    const { admin, uuid: adminUuid } = await bootstrapAdmin(app);

    // Roles + two accounts.
    const roles = (await request(app).get('/api/v1/roles').set(admin)).body.data as Array<{
      roleUID: string;
      roleName: string;
    }>;
    const nutzerRole = roles.find((r) => r.roleName === 'Nutzer')!;
    const adminRole = roles.find((r) => r.roleName === 'Admin')!;
    assert.ok(nutzerRole && adminRole);

    const accountA = (
      await request(app)
        .post('/api/v1/accounts')
        .set(admin)
        .send({ firstname: 'Anna', birthDate: '1985-04-12' })
    ).body.data.accountUID as string;
    const accountB = (
      await request(app)
        .post('/api/v1/accounts')
        .set(admin)
        .send({ firstname: 'Bea', birthDate: '1990-02-02' })
    ).body.data.accountUID as string;

    let clerkUuid = '';
    await t.test('admin creates a user and grants access to one account', async () => {
      const created = await request(app)
        .post('/api/v1/users')
        .set(admin)
        .send({ email: 'clerk@example.com', firstname: 'Cleo', password: 'clerkpass1' });
      assert.equal(created.status, 201);
      clerkUuid = created.body.data.uuid;
      assert.match(clerkUuid, /^[0-9a-f-]{36}$/);

      const granted = await request(app)
        .put(`/api/v1/users/${clerkUuid}/account-roles`)
        .set(admin)
        .send({ grants: [{ accountUID: accountA, roleUID: nutzerRole.roleUID }] });
      assert.equal(granted.status, 200);
      assert.deepEqual(granted.body.data.accountGrants, [
        { accountUID: accountA, roleName: 'Nutzer' },
      ]);
    });

    await t.test('the new user sees only the granted account', async () => {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'clerk@example.com', password: 'clerkpass1' });
      assert.equal(login.status, 200);
      const clerk = { Authorization: `Bearer ${login.body.accessToken}` };

      const accounts = await request(app).get('/api/v1/accounts').set(clerk);
      assert.deepEqual(
        accounts.body.data.map((a: { accountUID: string }) => a.accountUID),
        [accountA],
      );
      assert.equal((await request(app).get(`/api/v1/accounts/${accountB}`).set(clerk)).status, 403);

      // A non-admin cannot use the admin API.
      assert.equal((await request(app).get('/api/v1/users').set(clerk)).status, 403);
    });

    // SEC-11: both lists replace what the user holds, and each entry is its own
    // row in one transaction. The empty list has to keep working — it is the way
    // to take everything away (CR-18 made both a single statement).
    await t.test('the role lists are bounded, and the empty list still clears', async () => {
      const tooMany = await request(app)
        .put(`/api/v1/users/${clerkUuid}/global-roles`)
        .set(admin)
        .send({ roleUIDs: Array.from({ length: 101 }, () => nutzerRole.roleUID) });
      assert.equal(tooMany.status, 400);
      assert.equal(tooMany.body.error.code, 'VALIDATION_ERROR');

      const tooManyGrants = await request(app)
        .put(`/api/v1/users/${clerkUuid}/account-roles`)
        .set(admin)
        .send({
          grants: Array.from({ length: 101 }, () => ({
            accountUID: accountA,
            roleUID: nutzerRole.roleUID,
          })),
        });
      assert.equal(tooManyGrants.status, 400);

      const cleared = await request(app)
        .put(`/api/v1/users/${clerkUuid}/account-roles`)
        .set(admin)
        .send({ grants: [] });
      assert.equal(cleared.status, 200);
      assert.deepEqual(cleared.body.data.accountGrants, []);

      // Put the one grant back: the suites after this one read it.
      const regranted = await request(app)
        .put(`/api/v1/users/${clerkUuid}/account-roles`)
        .set(admin)
        .send({ grants: [{ accountUID: accountA, roleUID: nutzerRole.roleUID }] });
      assert.equal(regranted.status, 200);
    });

    // CR-11: a path segment that is not a UUID is a malformed call, so it is
    // answered as one instead of being looked up and reported as missing.
    await t.test('a user id that is not a UUID is a 400', async () => {
      const res = await request(app).get('/api/v1/users/kein-uuid').set(admin);
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /uuid/);
    });

    await t.test('safety guards protect the last admin', async () => {
      assert.equal(
        (await request(app).patch(`/api/v1/users/${adminUuid}`).set(admin).send({ status: 0 }))
          .status,
        400,
      );
      assert.equal(
        (await request(app).delete(`/api/v1/users/${adminUuid}`).set(admin)).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .put(`/api/v1/users/${adminUuid}/global-roles`)
            .set(admin)
            .send({ roleUIDs: [] })
        ).status,
        400,
      );
      // Admin is still there and still admin.
      const me = await request(app).get('/api/v1/me').set(admin);
      assert.ok(me.body.permissions.global.includes('MANAGE_USERS'));
    });

    await t.test('validation and duplicate email are rejected', async () => {
      assert.equal(
        (
          await request(app)
            .post('/api/v1/users')
            .set(admin)
            .send({ email: 'x@x.de', firstname: 'X' })
        ).status,
        400, // missing password
      );
      assert.equal(
        (
          await request(app)
            .post('/api/v1/users')
            .set(admin)
            .send({ email: 'clerk@example.com', firstname: 'Dup', password: 'clerkpass1' })
        ).status,
        409, // duplicate email
      );
    });
  } finally {
    await pool.end();
  }
});
