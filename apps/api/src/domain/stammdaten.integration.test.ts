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
  await pool.query('DELETE FROM ContractPremiums');
  await pool.query('DELETE FROM ContractBonusTiers');
  await pool.query('DELETE FROM ContractYears');
  await pool.query('DELETE FROM ContractTerms');
  await pool.query('DELETE FROM Contracts');
  await pool.query('DELETE FROM AgencyBankAccounts');
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
    await pool.query<Array<{ roleID: number }>>(
      "SELECT roleID FROM Roles WHERE roleName = 'Nutzer'",
    )
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
      // Creating an agency creates its first bank account, undated.
      assert.equal(agency.body.data.bankAccount, 'DE02120300000000202051');
      assert.deepEqual(
        agency.body.data.accounts.map((a: { validFrom: string | null; validTo: string | null }) => [
          a.validFrom,
          a.validTo,
        ]),
        [[null, null]],
      );

      const badBic = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Bad BIC', bankAccount: 'DE02120300000000202051', bic: 'nope' });
      assert.equal(badBic.status, 400);
      assert.equal(badBic.body.error.code, 'VALIDATION_ERROR');
    });

    await t.test('an agency keeps its identity when its bank account changes', async () => {
      const created = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Inkasso Wechsel', bankAccount: 'DE02120300000000202051' });
      assert.equal(created.status, 201);
      const uid = created.body.data.agencyUID as string;
      const undatedUID = created.body.data.accounts[0].agencyAccountUID as string;

      const changed = await request(app).post(`/api/v1/agencies/${uid}/accounts`).set(admin).send({
        validFrom: '2026-03-01',
        bankAccount: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        recipientName: 'Zahlstelle Wechsel',
        note: 'Bankwechsel',
      });
      assert.equal(changed.status, 201);

      // The read shows the whole history plus the account in force today,
      // flattened — and the older entry now ends the day before the change.
      const detail = await request(app).get(`/api/v1/agencies/${uid}`).set(admin);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.bankAccount, 'DE89370400440532013000');
      assert.equal(detail.body.data.recipientName, 'Zahlstelle Wechsel');
      assert.deepEqual(
        detail.body.data.accounts.map((a: { validFrom: string | null; validTo: string | null }) => [
          a.validFrom,
          a.validTo,
        ]),
        [
          [null, '2026-02-28'],
          ['2026-03-01', null],
        ],
      );

      // A second entry starting on the same day, and a second undated one, are
      // both refused: the resolution would be ambiguous.
      const sameDay = await request(app)
        .post(`/api/v1/agencies/${uid}/accounts`)
        .set(admin)
        .send({ validFrom: '2026-03-01', bankAccount: 'DE02500105170137075030' });
      assert.equal(sameDay.status, 409);
      assert.equal(sameDay.body.error.code, 'HISTORY_START_EXISTS');
      assert.equal(sameDay.body.error.details.undated, false);

      const secondUndated = await request(app)
        .post(`/api/v1/agencies/${uid}/accounts`)
        .set(admin)
        .send({ bankAccount: 'DE02500105170137075030' });
      assert.equal(secondUndated.status, 409);
      assert.equal(secondUndated.body.error.details.undated, true);

      // Renaming the agency leaves its accounts alone.
      const renamed = await request(app)
        .patch(`/api/v1/agencies/${uid}`)
        .set(admin)
        .send({ agencyName: 'Inkasso Umbenannt' });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.data.agencyName, 'Inkasso Umbenannt');
      assert.equal(renamed.body.data.accounts.length, 2);

      // Moving the change to another day, then dropping it again: the agency
      // falls back to the account it started with.
      const moved = await request(app)
        .patch(`/api/v1/agencies/${uid}/accounts/${changed.body.data.agencyAccountUID}`)
        .set(admin)
        .send({ validFrom: '2026-04-01' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.validFrom, '2026-04-01');

      const removed = await request(app)
        .delete(`/api/v1/agencies/${uid}/accounts/${changed.body.data.agencyAccountUID}`)
        .set(admin);
      assert.equal(removed.status, 204);

      const afterDelete = await request(app).get(`/api/v1/agencies/${uid}`).set(admin);
      assert.equal(afterDelete.body.data.bankAccount, 'DE02120300000000202051');
      assert.equal(afterDelete.body.data.accounts.length, 1);
      assert.equal(afterDelete.body.data.accounts[0].agencyAccountUID, undatedUID);

      // An account of another agency cannot be reached through this one.
      const otherAgency = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Inkasso Fremd', bankAccount: 'DE02500105170137075030' });
      const foreign = await request(app)
        .delete(
          `/api/v1/agencies/${uid}/accounts/${otherAgency.body.data.accounts[0].agencyAccountUID}`,
        )
        .set(admin);
      assert.equal(foreign.status, 404);
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

      const contractA = await request(app).post('/api/v1/contracts').set(admin).send({
        contractNumber: 'PKV-A',
        companyUID,
        accountUID: accountA,
        contractBegin: '2020-01-01',
        initialMonthlyPremium: 380,
        initialDeductible: 300,
        initialReimbursementCap: 5000,
      });
      assert.equal(contractA.status, 201);
      const contractAUID = contractA.body.data.contractUID as string;
      assert.equal(contractA.body.data.contractKind, 'FULL');
      assert.equal(contractA.body.data.bonusForfeitRule, 'ON_REIMBURSEMENT');

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
      assert.equal(
        (await request(app).get(`/api/v1/contracts/${contractAUID}`).set(user)).status,
        200,
      );
      assert.equal(
        (await request(app).get(`/api/v1/contracts/${contractBUID}`).set(user)).status,
        403,
      );

      // Nutzer may VIEW but not MANAGE contracts.
      const userPatch = await request(app)
        .patch(`/api/v1/contracts/${contractAUID}`)
        .set(user)
        .send({ contractKind: 'SUPPLEMENTARY' });
      assert.equal(userPatch.status, 403);

      const adminPatch = await request(app)
        .patch(`/api/v1/contracts/${contractAUID}`)
        .set(admin)
        .send({ claimFreeYearsAtStart: 3 });
      assert.equal(adminPatch.status, 200);
      assert.equal(adminPatch.body.data.claimFreeYearsAtStart, 3);

      // The history sub-routes follow the same account scoping.
      const userPremium = await request(app)
        .post(`/api/v1/contracts/${contractAUID}/premiums`)
        .set(user)
        .send({ validFrom: '2024-01-01', monthlyPremium: 400 });
      assert.equal(userPremium.status, 403);
      const otherAccountTerms = await request(app)
        .post(`/api/v1/contracts/${contractBUID}/terms`)
        .set(user)
        .send({ validFromYear: 2024, deductible: 0 });
      assert.equal(otherAccountTerms.status, 403);
    });

    await t.test('contracts: premiums and terms as a dated history', async () => {
      const companyUID = (
        await request(app).post('/api/v1/companies').set(admin).send({ companyName: 'Historie AG' })
      ).body.data.companyUID as string;
      const created = await request(app).post('/api/v1/contracts').set(admin).send({
        contractNumber: 'PKV-H',
        companyUID,
        accountUID: accountA,
        contractBegin: '2022-01-01',
        initialMonthlyPremium: 300,
        initialDeductible: 200,
      });
      assert.equal(created.status, 201);
      const uid = created.body.data.contractUID as string;
      const premiums = `/api/v1/contracts/${uid}/premiums`;
      const terms = `/api/v1/contracts/${uid}/terms`;

      // Two intra-year adjustments — still one policy.
      assert.equal(
        (
          await request(app)
            .post(premiums)
            .set(admin)
            .send({ validFrom: '2024-01-01', monthlyPremium: 320 })
        ).status,
        201,
      );
      const july = await request(app)
        .post(premiums)
        .set(admin)
        .send({ validFrom: '2024-07-01', monthlyPremium: 335, note: 'Zahntarif' });
      assert.equal(july.status, 201);
      const julyUID = july.body.data.premiumUID as string;

      // Same start twice, or a start before the contract begins, is rejected.
      assert.equal(
        (
          await request(app)
            .post(premiums)
            .set(admin)
            .send({ validFrom: '2024-07-01', monthlyPremium: 1 })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .post(premiums)
            .set(admin)
            .send({ validFrom: '2021-12-31', monthlyPremium: 1 })
        ).status,
        400,
      );

      assert.equal(
        (
          await request(app)
            .post(terms)
            .set(admin)
            .send({ validFromYear: 2025, deductible: 400, reimbursementRate: 80 })
        ).status,
        201,
      );
      assert.equal(
        (await request(app).post(terms).set(admin).send({ validFromYear: 2025, deductible: 1 }))
          .status,
        409,
      );
      assert.equal(
        (await request(app).post(terms).set(admin).send({ validFromYear: 2021, deductible: 1 }))
          .status,
        400,
      );

      const detail = await request(app).get(`/api/v1/contracts/${uid}`).set(admin);
      assert.equal(detail.status, 200);
      assert.deepEqual(
        detail.body.data.premiums.map((p: { validFrom: string; validTo: string | null }) => [
          p.validFrom,
          p.validTo,
        ]),
        [
          ['2022-01-01', '2023-12-31'],
          ['2024-01-01', '2024-06-30'],
          ['2024-07-01', null],
        ],
      );
      assert.deepEqual(
        detail.body.data.terms.map(
          (t: { validFromYear: number; validToYear: number | null; deductible: number }) => [
            t.validFromYear,
            t.validToYear,
            t.deductible,
          ],
        ),
        [
          [2022, 2024, 200],
          [2025, null, 400],
        ],
      );

      // The list shows exactly one row for the policy, with its current values.
      const list = await request(app).get('/api/v1/contracts').set(admin);
      const rows = list.body.data.filter(
        (c: { contractNumber: string }) => c.contractNumber === 'PKV-H',
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].currentMonthlyPremium, 335);

      // Editing and deleting an entry; an entry is only reachable via its own contract.
      const patched = await request(app)
        .patch(`${premiums}/${julyUID}`)
        .set(admin)
        .send({ monthlyPremium: 336 });
      assert.equal(patched.status, 200);
      assert.equal(patched.body.data.monthlyPremium, 336);
      const foreignContract = (
        await request(app).post('/api/v1/contracts').set(admin).send({
          contractNumber: 'PKV-F',
          companyUID,
          accountUID: accountA,
          contractBegin: '2022-01-01',
        })
      ).body.data.contractUID as string;
      assert.equal(
        (
          await request(app)
            .delete(`/api/v1/contracts/${foreignContract}/premiums/${julyUID}`)
            .set(admin)
        ).status,
        404,
      );
      assert.equal((await request(app).delete(`${premiums}/${julyUID}`).set(admin)).status, 204);
      const afterDelete = await request(app).get(`/api/v1/contracts/${uid}`).set(admin);
      assert.equal(afterDelete.body.data.premiums.length, 2);
      assert.equal(afterDelete.body.data.premiums[1].validTo, null);
    });
  } finally {
    await pool.end();
  }
});
