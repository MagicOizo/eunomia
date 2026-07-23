import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { hashPassword } from '../lib/password.js';

/**
 * CRUD + account-scoping for the master-data API (Slice 4). Skips when no DB is
 * configured; CI provides one.
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

const SETUP_TOKEN = 'stammdaten-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'stammdaten-secret',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      setupToken: SETUP_TOKEN,
    },
    trustProxy: 1,
    rateLimit: { authMax: 100000, authWindowMs: 60000, globalMax: 100000, globalWindowMs: 60000 },
  };
}

async function resetData(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM Contracts');
  await pool.query('DELETE FROM CollectionAgencies');
  await pool.query('DELETE FROM InsuranceCompanies');
  await pool.query('DELETE FROM Facilities');
  await pool.query('DELETE FROM RefreshTokens');
  await pool.query('DELETE FROM UserAccountRoles');
  await pool.query('DELETE FROM UserRoles');
  await pool.query('DELETE FROM Users');
  await pool.query('DELETE FROM Accounts');
}

/** Creates a user with the Nutzer role scoped to one account; returns a bearer header. */
async function scopedNutzer(
  pool: Pool,
  app: ReturnType<typeof createApp>,
  email: string,
  accountUID: string,
): Promise<Record<string, string>> {
  const password = 'scopeduser1';
  const insert = (await pool.query(
    'INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)',
    [email, 'Scoped', await hashPassword(password)],
  )) as { insertId: number };
  const nutzer = (
    await pool.query<Array<{ roleID: number }>>("SELECT roleID FROM Roles WHERE roleName = 'Nutzer'")
  )[0];
  await pool.query('INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)', [
    insert.insertId,
    nutzer?.roleID,
    accountUID,
  ]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(login.status, 200, 'scoped user should log in');
  return { Authorization: `Bearer ${login.body.accessToken}` };
}

test('master-data CRUD and account scoping', async (t) => {
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

    // Bootstrap an admin and log in.
    await request(app)
      .post('/api/v1/setup')
      .set('X-Setup-Token', SETUP_TOKEN)
      .send({ email: 'admin@example.com', password: 'adminpass1', firstname: 'Ada' });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass1' });
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };

    await t.test('facilities: full CRUD lifecycle and auth guard', async () => {
      const anon = await request(app).post('/api/v1/facilities').send({ facilityName: 'X' });
      assert.equal(anon.status, 401);

      const created = await request(app)
        .post('/api/v1/facilities')
        .set(admin)
        .send({ facilityName: 'Hausarzt Dr. Test', distanceKm: 4 });
      assert.equal(created.status, 201);
      const uid = created.body.data.facilityUID as string;
      assert.match(uid, /^f/);

      const list = await request(app).get('/api/v1/facilities').set(admin);
      assert.equal(list.status, 200);
      assert.ok(list.body.data.some((f: { facilityUID: string }) => f.facilityUID === uid));

      const patched = await request(app)
        .patch(`/api/v1/facilities/${uid}`)
        .set(admin)
        .send({ distanceKm: 9 });
      assert.equal(patched.status, 200);
      assert.equal(patched.body.data.distanceKm, 9);

      const del = await request(app).delete(`/api/v1/facilities/${uid}`).set(admin);
      assert.equal(del.status, 204);

      const gone = await request(app).get(`/api/v1/facilities/${uid}`).set(admin);
      assert.equal(gone.status, 404);
    });

    await t.test('companies and agencies routes are wired and validate input', async () => {
      const company = await request(app)
        .post('/api/v1/companies')
        .set(admin)
        .send({ companyName: 'Test Kranken AG', addressPostalCode: '12345' });
      assert.equal(company.status, 201);

      const badPostal = await request(app)
        .post('/api/v1/companies')
        .set(admin)
        .send({ companyName: 'Bad', addressPostalCode: 'ABCDE' });
      assert.equal(badPostal.status, 400);
      assert.equal(badPostal.body.error.code, 'VALIDATION_ERROR');

      const agency = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Inkasso Test', bankAccount: 'DE02120300000000202051' });
      assert.equal(agency.status, 201);
    });

    // Two accounts; a scoped user granted access to only the first.
    let accountA = '';
    let accountB = '';

    await t.test('accounts: admin creates, scoped user sees only theirs', async () => {
      const a = await request(app)
        .post('/api/v1/accounts')
        .set(admin)
        .send({ firstname: 'Anna', surname: 'A', birthDate: '1985-04-12' });
      const b = await request(app)
        .post('/api/v1/accounts')
        .set(admin)
        .send({ firstname: 'Bea', surname: 'B', birthDate: '1990-02-02' });
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      accountA = a.body.data.accountUID;
      accountB = b.body.data.accountUID;
      assert.equal(a.body.data.birthDate, '1985-04-12'); // date round-trips as a plain string

      const adminList = await request(app).get('/api/v1/accounts').set(admin);
      assert.equal(adminList.body.data.length, 2);

      const user = await scopedNutzer(pool, app, 'user@example.com', accountA);

      const userList = await request(app).get('/api/v1/accounts').set(user);
      assert.equal(userList.status, 200);
      assert.deepEqual(
        userList.body.data.map((acc: { accountUID: string }) => acc.accountUID),
        [accountA],
      );

      assert.equal((await request(app).get(`/api/v1/accounts/${accountA}`).set(user)).status, 200);
      assert.equal((await request(app).get(`/api/v1/accounts/${accountB}`).set(user)).status, 403);

      // Creating an account needs a GLOBAL manage grant, which a scoped user lacks.
      const forbiddenCreate = await request(app)
        .post('/api/v1/accounts')
        .set(user)
        .send({ firstname: 'Nope', birthDate: '2000-01-01' });
      assert.equal(forbiddenCreate.status, 403);
    });

    await t.test('contracts: scoped via the contract account', async () => {
      const company = await request(app)
        .post('/api/v1/companies')
        .set(admin)
        .send({ companyName: 'Vertrag Kranken AG' });
      const companyUID = company.body.data.companyUID as string;

      const contractA = await request(app)
        .post('/api/v1/contracts')
        .set(admin)
        .send({
          contractNumber: 'PKV-A',
          companyUID,
          accountUID: accountA,
          contractBegin: '2020-01-01',
          deductible: 300,
        });
      assert.equal(contractA.status, 201);
      const contractAUID = contractA.body.data.contractUID as string;
      assert.equal(contractA.body.data.deductible, 300);

      const contractB = await request(app).post('/api/v1/contracts').set(admin).send({
        contractNumber: 'PKV-B',
        companyUID,
        accountUID: accountB,
        contractBegin: '2020-01-01',
      });
      assert.equal(contractB.status, 201);
      const contractBUID = contractB.body.data.contractUID as string;

      // A well-formed but unknown accountUID fails the foreign key -> 400.
      const badRef = await request(app).post('/api/v1/contracts').set(admin).send({
        contractNumber: 'PKV-X',
        companyUID,
        accountUID: 'a23456789ABC',
        contractBegin: '2020-01-01',
      });
      assert.equal(badRef.status, 400);

      const user = await scopedNutzer(pool, app, 'contractuser@example.com', accountA);

      const userList = await request(app).get('/api/v1/contracts').set(user);
      assert.deepEqual(
        userList.body.data.map((c: { contractUID: string }) => c.contractUID),
        [contractAUID],
      );
      assert.equal((await request(app).get(`/api/v1/contracts/${contractAUID}`).set(user)).status, 200);
      assert.equal((await request(app).get(`/api/v1/contracts/${contractBUID}`).set(user)).status, 403);

      // Nutzer may VIEW but not MANAGE contracts.
      const userPatch = await request(app)
        .patch(`/api/v1/contracts/${contractAUID}`)
        .set(user)
        .send({ bonus: 500 });
      assert.equal(userPatch.status, 403);

      const adminPatch = await request(app)
        .patch(`/api/v1/contracts/${contractAUID}`)
        .set(admin)
        .send({ bonus: 500 });
      assert.equal(adminPatch.status, 200);
      assert.equal(adminPatch.body.data.bonus, 500);
    });
  } finally {
    await pool.end();
  }
});
