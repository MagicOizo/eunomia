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
 * Bonus scale and claim-free years end to end (Slice 18 DoD): tiers stored
 * with the yearly terms, the counted streak with a start value, a
 * reimbursement resetting it, the per-billing and per-year overrides, and a
 * recorded actual bonus next to the forecast. The policy ends in 2024 so the
 * timeline does not depend on the current date. Skips when no DB is
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

const SETUP_TOKEN = 'years-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'years-secret',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      setupToken: SETUP_TOKEN,
    },
    trustProxy: 1,
    rateLimit: { authMax: 100000, authWindowMs: 60000, globalMax: 100000, globalWindowMs: 60000 },
  };
}

async function resetData(pool: Pool): Promise<void> {
  for (const stmt of [
    'DELETE FROM Allocations',
    'DELETE FROM ServiceBillings',
    'DELETE FROM SubmissionInvoices',
    'DELETE FROM InvoiceExclusions',
    'DELETE FROM Invoices',
    'DELETE FROM Submissions',
    'DELETE FROM ContractPremiums',
    'DELETE FROM ContractBonusTiers',
    'DELETE FROM ContractYears',
    'DELETE FROM ContractTerms',
    'DELETE FROM Contracts',
    'DELETE FROM InsuranceCompanies',
    'DELETE FROM RefreshTokens',
    'DELETE FROM UserAccountRoles',
    'DELETE FROM UserRoles',
    'DELETE FROM Users',
    'DELETE FROM Accounts',
  ]) {
    await pool.query(stmt);
  }
}

interface YearDto {
  year: number;
  forfeited: boolean;
  forfeitSource: string | null;
  pendingClaims: number;
  claimFreeStreak: number;
  expectedBonus: number | null;
  tiersInherited: boolean;
  actualBonus: number | null;
  bonusForfeitedOverride: boolean | null;
  note: string | null;
}

test('bonus scale and claim-free years', async (t) => {
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

    const app = createApp({ pool, config: testConfig(database) });
    await request(app)
      .post('/api/v1/setup')
      .set('X-Setup-Token', SETUP_TOKEN)
      .send({ email: 'admin@example.com', password: 'adminpass1', firstname: 'Ada' });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass1' });
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };
    const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object) =>
      request(app)[method](path).set(admin).send(body);

    const accountA = (
      await send('post', '/api/v1/accounts', { firstname: 'Anna', birthDate: '1985-04-12' })
    ).body.data.accountUID as string;
    const accountB = (
      await send('post', '/api/v1/accounts', { firstname: 'Bea', birthDate: '1990-02-02' })
    ).body.data.accountUID as string;
    const companyUID = (await send('post', '/api/v1/companies', { companyName: 'Kranken AG' })).body
      .data.companyUID as string;

    // One claim-free year before counting starts in 2021; the policy ends 2024.
    const contractUID = (
      await send('post', '/api/v1/contracts', {
        contractNumber: 'PKV-B',
        companyUID,
        accountUID: accountA,
        contractBegin: '2020-01-01',
        contractEnd: '2024-12-31',
        bonusForfeitRule: 'ON_REIMBURSEMENT',
        claimFreeYearsAtStart: 1,
        claimFreeCountingFromYear: 2021,
      })
    ).body.data.contractUID as string;
    const base = `/api/v1/contracts/${contractUID}`;
    const years = async (): Promise<Map<number, YearDto>> => {
      const res = await request(app).get(base).set(admin);
      assert.equal(res.status, 200);
      return new Map((res.body.data.years as YearDto[]).map((y) => [y.year, y]));
    };

    let termsUID = '';
    await t.test('terms store and replace their bonus scale', async () => {
      const created = await send('post', `${base}/terms`, {
        validFromYear: 2021,
        deductible: 200,
        bonusTiers: [
          { claimFreeYears: 1, bonusAmount: 250 },
          { claimFreeYears: 4, bonusAmount: 600 },
        ],
      });
      assert.equal(created.status, 201);
      termsUID = created.body.data.termsUID;

      const patched = await send('patch', `${base}/terms/${termsUID}`, {
        bonusTiers: [
          { claimFreeYears: 4, bonusAmount: 600 },
          { claimFreeYears: 1, bonusAmount: 300 },
          { claimFreeYears: 2, bonusAmount: 450 },
        ],
      });
      assert.equal(patched.status, 200);
      const detail = await request(app).get(base).set(admin);
      assert.deepEqual(detail.body.data.terms[0].bonusTiers, [
        { claimFreeYears: 1, bonusAmount: 300 },
        { claimFreeYears: 2, bonusAmount: 450 },
        { claimFreeYears: 4, bonusAmount: 600 },
      ]);
      assert.equal(detail.body.data.terms[0].deductible, 200);
    });

    await t.test('a scale with a duplicate step is rejected', async () => {
      const res = await send('patch', `${base}/terms/${termsUID}`, {
        bonusTiers: [
          { claimFreeYears: 1, bonusAmount: 300 },
          { claimFreeYears: 1, bonusAmount: 350 },
        ],
      });
      assert.equal(res.status, 400);
    });

    await t.test('without claims the streak counts on from the start value', async () => {
      const y = await years();
      assert.deepEqual([...y.keys()], [2021, 2022, 2023, 2024]);
      assert.deepEqual(
        [...y.values()].map((v) => [v.claimFreeStreak, v.expectedBonus]),
        [
          [2, 450],
          [3, 450],
          [4, 600],
          [5, 600],
        ],
      );
      assert.equal(y.get(2021)?.tiersInherited, false);
      assert.equal(y.get(2022)?.tiersInherited, true);
    });

    const makeInvoice = async (number: string, treatmentDate: string): Promise<string> =>
      (
        await send('post', '/api/v1/invoices', {
          invoiceNumber: number,
          invoiceDate: treatmentDate,
          treatmentDate,
          accountUID: accountA,
          invoiceAmount: 400,
        })
      ).body.data.invoiceUID as string;
    const inv2023 = await makeInvoice('R-2023', '2023-03-01');
    const inv2024 = await makeInvoice('R-2024', '2024-03-01');
    const submissionUID = (
      await send('post', '/api/v1/submissions', {
        contractUID,
        submittedDate: '2024-04-01',
        invoiceUIDs: [inv2023, inv2024],
      })
    ).body.data.submissionUID as string;

    let billingUID = '';
    await t.test('a pending claim only puts the year at risk', async () => {
      const y = await years();
      assert.equal(y.get(2023)?.forfeited, false);
      assert.equal(y.get(2023)?.pendingClaims, 1);
      assert.equal(y.get(2024)?.pendingClaims, 1);
    });

    await t.test('a reimbursement forfeits its treatment year and resets the streak', async () => {
      const billing = await send('post', '/api/v1/billings', {
        submissionUID,
        billingDate: '2024-05-01',
        billingNumber: 'LA-1',
      });
      assert.equal(billing.status, 201);
      assert.equal(billing.body.data.forfeitsBonus, null);
      billingUID = billing.body.data.billingUID;
      const alloc = await send('post', '/api/v1/allocations', {
        invoiceUID: inv2023,
        billingUID,
        reimbursement: 150,
      });
      assert.equal(alloc.status, 201);

      const y = await years();
      assert.equal(y.get(2023)?.forfeited, true);
      assert.equal(y.get(2023)?.forfeitSource, 'claims');
      assert.equal(y.get(2023)?.expectedBonus, 0);
      assert.equal(y.get(2024)?.claimFreeStreak, 1);
      assert.equal(y.get(2024)?.expectedBonus, 300);
      assert.equal(y.get(2024)?.pendingClaims, 1);
    });

    await t.test('a billing marked "keeps the bonus" does not forfeit', async () => {
      const res = await send('patch', `/api/v1/billings/${billingUID}`, { forfeitsBonus: false });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.forfeitsBonus, false);
      const listed = await request(app)
        .get(`/api/v1/billings?contractUID=${contractUID}`)
        .set(admin);
      assert.equal(listed.body.data[0].forfeitsBonus, false);
      assert.equal(listed.body.data[0].bonusForfeitRule, 'ON_REIMBURSEMENT');

      const y = await years();
      assert.equal(y.get(2023)?.forfeited, false);
      assert.equal(y.get(2024)?.claimFreeStreak, 5);
      await send('patch', `/api/v1/billings/${billingUID}`, { forfeitsBonus: true });
      assert.equal((await years()).get(2023)?.forfeited, true);
    });

    await t.test('the year record overrides and reports the actual bonus', async () => {
      const put = await send('put', `${base}/years/2022`, {
        actualBonus: 440,
        bonusForfeited: true,
        note: 'Schreiben der Versicherung',
      });
      assert.equal(put.status, 200);
      let y = await years();
      assert.equal(y.get(2022)?.forfeited, true);
      assert.equal(y.get(2022)?.forfeitSource, 'override');
      assert.equal(y.get(2022)?.actualBonus, 440);
      assert.equal(y.get(2022)?.note, 'Schreiben der Versicherung');

      await send('put', `${base}/years/2022`, { actualBonus: 450 });
      y = await years();
      assert.equal(y.get(2022)?.forfeited, false);
      assert.equal(y.get(2022)?.bonusForfeitedOverride, null);
      assert.equal(y.get(2022)?.actualBonus, 450);
      assert.equal(y.get(2022)?.expectedBonus, 450);

      await send('put', `${base}/years/2022`, { actualBonus: null, note: '' });
      const [row] = await pool.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM ContractYears WHERE contractUID = ?',
        [contractUID],
      );
      assert.equal(Number(row?.n), 0);

      await send('put', `${base}/years/2021`, { bonusForfeited: true });
      assert.equal((await send('delete', `${base}/years/2021`)).status, 204);
      assert.equal((await years()).get(2021)?.forfeited, false);
    });

    await t.test('a year outside the contract term is rejected', async () => {
      assert.equal((await send('put', `${base}/years/2019`, { actualBonus: 1 })).status, 400);
      assert.equal((await send('put', `${base}/years/2025`, { actualBonus: 1 })).status, 400);
    });

    await t.test('only users with access to the account may record years', async () => {
      const password = 'scopeduser1';
      const insert = (await pool.query(
        'INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)',
        ['bea@example.com', 'Bea', await hashPassword(password)],
      )) as { insertId: number };
      await pool.query(
        `INSERT INTO UserAccountRoles (userID, roleID, accountUID)
         SELECT ?, roleID, ? FROM Roles WHERE roleName = 'Nutzer'`,
        [insert.insertId, accountB],
      );
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bea@example.com', password });
      const res = await request(app)
        .put(`${base}/years/2022`)
        .set({ Authorization: `Bearer ${login.body.accessToken}` })
        .send({ actualBonus: 1 });
      assert.equal(res.status, 403);
    });
  } finally {
    // Later test files only clear the tables they fill themselves.
    await resetData(pool).catch(() => undefined);
    await pool.end();
  }
});
