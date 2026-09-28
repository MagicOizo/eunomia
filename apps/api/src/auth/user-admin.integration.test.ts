import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';

/**
 * Admin user/role management (Slice 9): the DoD flow (create a user, grant one
 * account, that user sees only that account), plus gating and the safety guards.
 * Skips without a DB; CI provides one.
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

const SETUP_TOKEN = 'admin-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'admin-secret',
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

async function resetData(pool: Pool): Promise<void> {
  for (const stmt of [
    'DELETE FROM Allocations',
    'DELETE FROM ServiceBillings',
    'DELETE FROM SubmissionInvoices',
    'DELETE FROM InvoiceExclusions',
    'DELETE FROM InvoiceTreatmentDays',
    'DELETE FROM Invoices',
    'DELETE FROM Submissions',
    'DELETE FROM ContractPremiums',
    'DELETE FROM ContractBonusTiers',
    'DELETE FROM ContractYears',
    'DELETE FROM ContractTerms',
    'DELETE FROM Contracts',
    'DELETE FROM InsuranceCompanies',
    'DELETE FROM AgencyBankAccounts',
    'DELETE FROM CollectionAgencies',
    'DELETE FROM Facilities',
    'DELETE FROM UserAccountRoles',
    'DELETE FROM UserRoles',
    'DELETE FROM RefreshTokens',
    'DELETE FROM Users',
    'DELETE FROM Accounts',
  ]) {
    await pool.query(stmt);
  }
}

test('admin user/role management: DoD flow, gating, guards', async (t) => {
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
    await resetData(pool);

    const config = testConfig(database);
    const app = createApp({ pool, config });

    // Bootstrap admin.
    const setup = await request(app)
      .post('/api/v1/setup')
      .set('X-Setup-Token', SETUP_TOKEN)
      .send({ email: 'admin@example.com', password: 'adminpass1', firstname: 'Ada' });
    const adminUuid = setup.body.user.uuid as string;
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass1' });
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };

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
      assert.equal(
        (await request(app).get(`/api/v1/accounts/${accountB}/ping`).set(clerk)).status,
        403,
      );

      // A non-admin cannot use the admin API.
      assert.equal((await request(app).get('/api/v1/users').set(clerk)).status, 403);
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
