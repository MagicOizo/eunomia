import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS, type PermissionKey } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { generateEntityId } from '../lib/ids.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

type Doc = Record<string, unknown>;

/**
 * The start page's figures (issues.md 0.15.0-3): the sums over everything the
 * caller may see, and that each block answers to the permission of its own
 * way — a person bound to one account sees that account's figures and nothing
 * of the others, invoices without contracts show no policies and no bonus.
 */
test('dashboard: the figures, under the permission of each', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const app = createApp({ pool, config: testConfig({ database }) });
    const { admin } = await bootstrapAdmin(app);
    const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
    const put = (path: string, body: object) => request(app).put(path).set(admin).send(body);
    const year = new Date().getFullYear();

    const anna = (await post('/api/v1/accounts', { firstname: 'Anna', birthDate: '1985-04-12' }))
      .body.data.accountUID as string;
    const bea = (await post('/api/v1/accounts', { firstname: 'Bea', birthDate: '1990-02-02' })).body
      .data.accountUID as string;
    const companyUID = (await post('/api/v1/companies', { companyName: 'Kranken AG' })).body.data
      .companyUID as string;

    const contractUID = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-A',
        companyUID,
        accountUID: anna,
        contractBegin: '2020-01-01',
      })
    ).body.data.contractUID as string;
    await post(`/api/v1/contracts/${contractUID}/terms`, {
      validFromYear: 2021,
      deductible: 200,
      bonusTiers: [{ claimFreeYears: 1, bonusAmount: 250 }],
    });
    await put(`/api/v1/contracts/${contractUID}/years/2022`, { actualBonus: 250 });

    const invoice = async (body: object): Promise<string> => {
      const res = await post('/api/v1/invoices', body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.data.invoiceUID as string;
    };
    // Anna, 2024: paid, submitted, 200 of 500 reimbursed — teilabgerechnet.
    const answered = await invoice({
      invoiceNumber: 'R-1',
      invoiceDate: '2024-05-03',
      treatmentDate: '2024-05-01',
      accountUID: anna,
      invoiceAmount: 500,
      transferDate: '2024-05-20',
    });
    await post('/api/v1/submissions', {
      contractUID,
      submittedDate: '2024-06-01',
      invoiceUIDs: [answered],
    });
    const billingUID = (
      await post('/api/v1/billings', {
        contractUID,
        billingDate: '2024-07-01',
        billingNumber: 'LA-1',
      })
    ).body.data.billingUID as string;
    await post(`/api/v1/billings/${billingUID}/allocations`, {
      entries: [{ invoiceUID: answered, reimbursement: 200 }],
    });
    // Anna, this year: unpaid and long overdue, nowhere submitted.
    await invoice({
      invoiceNumber: 'R-2',
      invoiceDate: `${year}-01-01`,
      treatmentDate: `${year}-01-01`,
      accountUID: anna,
      invoiceAmount: 100,
      transferUntilDate: '2020-01-01',
    });
    // Bea, 2025: paid, nowhere submitted.
    await invoice({
      invoiceNumber: 'R-3',
      invoiceDate: '2025-02-02',
      treatmentDate: '2025-02-01',
      accountUID: bea,
      invoiceAmount: 99,
      transferDate: '2025-02-10',
    });

    const dashboard = async (auth: Record<string, string>): Promise<Doc> => {
      const res = await request(app).get('/api/v1/dashboard').set(auth);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body.data as Doc;
    };
    const people = (doc: Doc): Doc[] => doc.accounts as Doc[];

    /** A login holding a role of exactly these permissions, bound to one account. */
    const userWith = async (
      email: string,
      accountUID: string,
      permissions: PermissionKey[],
    ): Promise<Record<string, string>> => {
      const roleUID = generateEntityId('role');
      await pool.query('INSERT INTO Roles (roleUID, roleName, roleStatus) VALUES (?, ?, 1)', [
        roleUID,
        email,
      ]);
      for (const permission of permissions) {
        await pool.query(
          `INSERT INTO RolePermissions (roleID, permissionID)
           SELECT (SELECT roleID FROM Roles WHERE roleUID = ?), permissionID
             FROM Permissions WHERE permissionKey = ?`,
          [roleUID, permission],
        );
      }
      const created = await post('/api/v1/users', {
        email,
        firstname: 'Leser',
        password: 'lesepass1',
      });
      await put(`/api/v1/users/${created.body.data.uuid}/account-roles`, {
        grants: [{ accountUID, roleUID }],
      });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'lesepass1' });
      return { Authorization: `Bearer ${login.body.accessToken}` };
    };

    await t.test('the totals run over every person, since the first invoice', async () => {
      const doc = await dashboard(admin);
      assert.equal(doc.since, '2024-05-03');
      assert.deepEqual(doc.totals, {
        invoiceCount: 3,
        invoiceAmount: 699,
        reimbursed: 200,
        selfBorne: 499,
        bonusPaid: 250,
        accountCount: 2,
        contractCount: 1,
      });
    });

    await t.test('the year series holds a bonus year without invoices', async () => {
      const doc = await dashboard(admin);
      const years = doc.years as Doc[];
      assert.deepEqual(
        years.map((row) => row.year),
        [2022, 2024, 2025, year],
      );
      assert.deepEqual(years[0], {
        year: 2022,
        invoiceCount: 0,
        invoiceAmount: 0,
        reimbursed: 0,
        selfBorne: 0,
        bonusPaid: 250,
      });
      assert.deepEqual(years[1], {
        year: 2024,
        invoiceCount: 1,
        invoiceAmount: 500,
        reimbursed: 200,
        selfBorne: 300,
        bonusPaid: 0,
      });
    });

    await t.test('per person: what is unpaid and what is still under way', async () => {
      const [first, second] = people(await dashboard(admin));
      assert.equal(first?.firstname, 'Anna');
      assert.deepEqual(first?.payment, {
        unpaidCount: 1,
        unpaidAmount: 100,
        dueCount: 0,
        overdueCount: 1,
      });
      assert.deepEqual(first?.workflow, { offen: 1, eingereicht: 0, teilabgerechnet: 1 });
      assert.equal(second?.firstname, 'Bea');
      assert.deepEqual(second?.workflow, { offen: 1, eingereicht: 0, teilabgerechnet: 0 });
      assert.deepEqual(second?.policies, [], 'no policy, nothing to show');
    });

    await t.test('per policy the running year says what the reimbursement plan says', async () => {
      const [first] = people(await dashboard(admin));
      const plan = (
        await request(app).get(`/api/v1/accounts/${anna}/reimbursement-plan`).set(admin)
      ).body.data as { policies: Doc[] };
      const [expected] = plan.policies;
      const [policy] = first?.policies as Doc[];
      assert.equal(first?.year, year);
      assert.equal(policy?.contractNumber, 'PKV-A');
      for (const key of [
        'hasTerms',
        'deductible',
        'deductibleUsed',
        'bonusStatus',
        'pendingClaims',
        'tiersInherited',
        'recommendation',
        'status',
      ]) {
        assert.equal(policy?.[key], expected?.[key], key);
      }
      assert.equal(policy?.deductible, 200);
      assert.equal(policy?.deductibleLeft, Math.max(0, 200 - Number(expected?.deductibleUsed)));
    });

    await t.test('a person bound to one account sees that account only', async () => {
      const nutzer = await userWith('bea-leser@example.com', bea, [
        PERMISSIONS.VIEW_INVOICES,
        PERMISSIONS.VIEW_CONTRACTS,
        PERMISSIONS.VIEW_ACCOUNTS,
      ]);
      const doc = await dashboard(nutzer);
      assert.deepEqual(doc.totals, {
        invoiceCount: 1,
        invoiceAmount: 99,
        reimbursed: 0,
        selfBorne: 99,
        bonusPaid: 0,
        accountCount: 1,
        contractCount: 0,
      });
      assert.deepEqual(
        people(doc).map((person) => person.firstname),
        ['Bea'],
      );
      assert.ok(!JSON.stringify(doc).includes('PKV-A'));
    });

    await t.test('invoices without contracts: no policies, no bonus, no policy count', async () => {
      const reader = await userWith('anna-rechnungen@example.com', anna, [
        PERMISSIONS.VIEW_INVOICES,
      ]);
      const doc = await dashboard(reader);
      const totals = doc.totals as Doc;
      assert.equal(totals.invoiceCount, 2);
      assert.equal(totals.bonusPaid, 0);
      assert.equal(totals.contractCount, 0);
      assert.equal(totals.accountCount, 0, 'counting persons is VIEW_ACCOUNTS');
      assert.deepEqual(
        (doc.years as Doc[]).map((row) => row.year),
        [2024, year],
        'the bonus-only year belongs to the contracts',
      );
      const [only] = people(doc);
      assert.equal(only?.firstname, 'Anna');
      assert.deepEqual(only?.policies, []);
    });

    await t.test('without any permission the page still loads, empty', async () => {
      const nobody = await userWith('niemand@example.com', anna, []);
      const doc = await dashboard(nobody);
      assert.equal(doc.since, null);
      assert.deepEqual(doc.years, []);
      assert.deepEqual(doc.accounts, []);
      assert.equal((doc.totals as Doc).invoiceCount, 0);
    });
  } finally {
    await pool.end();
  }
});
