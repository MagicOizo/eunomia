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
 * The full invoice workflow loop (Slice 5 DoD): create -> submit -> bill ->
 * allocate -> settle, plus the cross-entity invariants and account scoping.
 * Slice 17 adds the multi-policy loop: partial reimbursement at x, remainder
 * at y, exclusions, withdrawal and the "no enrichment" rule.
 * Slice 19 checks the reimbursement plan against that recorded reality.
 * Skips when no DB is configured; CI provides one.
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

const SETUP_TOKEN = 'workflow-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'workflow-secret',
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
  return { Authorization: `Bearer ${login.body.accessToken}` };
}

test('invoice workflow: full loop, invariants and scoping', async (t) => {
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

    await request(app)
      .post('/api/v1/setup')
      .set('X-Setup-Token', SETUP_TOKEN)
      .send({ email: 'admin@example.com', password: 'adminpass1', firstname: 'Ada' });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'adminpass1' });
    const admin = { Authorization: `Bearer ${adminLogin.body.accessToken}` };

    const post = (path: string, body: object, headers: Record<string, string> = admin) =>
      request(app).post(path).set(headers).send(body);

    // Master data.
    const accountA = (
      await post('/api/v1/accounts', { firstname: 'Anna', birthDate: '1985-04-12' })
    ).body.data.accountUID as string;
    const accountB = (await post('/api/v1/accounts', { firstname: 'Bea', birthDate: '1990-02-02' }))
      .body.data.accountUID as string;
    const companyUID = (await post('/api/v1/companies', { companyName: 'Kranken AG' })).body.data
      .companyUID as string;
    const contractA = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-A',
        companyUID,
        accountUID: accountA,
        contractBegin: '2020-01-01',
        initialDeductible: 300,
      })
    ).body.data.contractUID as string;

    // Two open invoices for account A, totalling 1000.
    const makeInvoice = async (account: string, amount: number, number: string): Promise<string> =>
      (
        await post('/api/v1/invoices', {
          invoiceNumber: number,
          invoiceDate: '2024-05-01',
          treatmentDate: '2024-05-01',
          accountUID: account,
          invoiceAmount: amount,
        })
      ).body.data.invoiceUID as string;

    const inv1 = await makeInvoice(accountA, 500, 'R-1');
    const inv2 = await makeInvoice(accountA, 500, 'R-2');

    await t.test('a fresh invoice is "offen"', async () => {
      const res = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
      assert.equal(res.body.data.workflowStatus, 'offen');
    });

    let submissionUID = '';
    await t.test('batch submission bundles both invoices and marks them eingereicht', async () => {
      const res = await post('/api/v1/submissions', {
        contractUID: contractA,
        submittedDate: '2024-06-01',
        invoiceUIDs: [inv1, inv2],
      });
      assert.equal(res.status, 201);
      submissionUID = res.body.data.submissionUID;
      assert.deepEqual(res.body.data.invoiceUIDs.sort(), [inv1, inv2].sort());

      const inv = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
      assert.deepEqual(
        inv.body.data.submissions.map((s: { submissionUID: string }) => s.submissionUID),
        [submissionUID],
      );
      assert.equal(inv.body.data.submissions[0].contractNumber, 'PKV-A');
      assert.equal(inv.body.data.workflowStatus, 'eingereicht');
    });

    await t.test('re-submitting to the same contract conflicts', async () => {
      const res = await post('/api/v1/submissions', {
        contractUID: contractA,
        submittedDate: '2024-06-02',
        invoiceUIDs: [inv1],
      });
      assert.equal(res.status, 409);
    });

    await t.test('submitting a foreign-account invoice is rejected', async () => {
      const inv3 = await makeInvoice(accountB, 100, 'R-3');
      const res = await post('/api/v1/submissions', {
        contractUID: contractA,
        submittedDate: '2024-06-02',
        invoiceUIDs: [inv3],
      });
      assert.equal(res.status, 400);
    });

    let billingUID = '';
    await t.test('a partial reimbursement moves the invoice to teilabgerechnet', async () => {
      billingUID = (
        await post('/api/v1/billings', {
          submissionUID,
          billingDate: '2024-07-01',
          billingNumber: 'LA-1',
        })
      ).body.data.billingUID as string;

      const alloc = await post(`/api/v1/billings/${billingUID}/allocations`, {
        entries: [{ invoiceUID: inv1, reimbursement: 200 }],
      });
      assert.equal(alloc.status, 201);

      const inv = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
      assert.equal(inv.body.data.workflowStatus, 'teilabgerechnet');
      assert.equal(Number(inv.body.data.reimbursedTotal), 200);
      assert.equal(inv.body.data.remainingAmount, 300);
      assert.equal(inv.body.data.submissions[0].status, 'abgerechnet');

      // The invoice detail's cards need the billing behind the reimbursement.
      const [allocation] = inv.body.data.submissions[0].allocations;
      assert.equal(allocation.billingUID, billingUID);
      assert.equal(allocation.billingNumber, 'LA-1');
      assert.equal(allocation.billingDate, '2024-07-01');
      assert.equal(Number(allocation.reimbursement), 200);
      assert.equal(allocation.objectionOpen, false);
    });

    await t.test('GET /billings?contractUID lists the contract billings, enriched', async () => {
      const res = await request(app).get(`/api/v1/billings?contractUID=${contractA}`).set(admin);
      assert.equal(res.status, 200);
      const billing = res.body.data.find(
        (b: { billingUID: string }) => b.billingUID === billingUID,
      );
      assert.ok(billing, 'the created billing is listed for its contract');
      assert.equal(billing.contractNumber, 'PKV-A');
      assert.equal(Number(billing.reimbursedTotal), 200);
      assert.ok(billing.personName.length > 0);
      assert.ok((billing.invoiceNumbers ?? '').includes('R-1'));
    });

    await t.test(
      'filing an objection on the billing flags the invoice; resolving clears it',
      async () => {
        let inv = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
        assert.equal(inv.body.data.hasOpenObjection, false);

        const filed = await request(app)
          .patch(`/api/v1/billings/${billingUID}`)
          .set(admin)
          .send({ objectionDate: '2024-07-15', objectionNote: 'Betrag zu niedrig' });
        assert.equal(filed.status, 200);
        assert.ok(filed.body.data.objectionDate);

        inv = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
        assert.equal(inv.body.data.hasOpenObjection, true);

        const resolved = await request(app)
          .patch(`/api/v1/billings/${billingUID}`)
          .set(admin)
          .send({ objectionResolvedDate: '2024-09-01' });
        assert.equal(resolved.status, 200);

        inv = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
        assert.equal(inv.body.data.hasOpenObjection, false);
      },
    );

    await t.test('deleting a billing cascades: its invoice reverts to eingereicht', async () => {
      const delBilling = (
        await post('/api/v1/billings', {
          submissionUID,
          billingDate: '2024-07-05',
          billingNumber: 'LA-DEL',
        })
      ).body.data.billingUID as string;
      await post(`/api/v1/billings/${delBilling}/allocations`, {
        entries: [{ invoiceUID: inv2, reimbursement: 150 }],
      });

      let inv = await request(app).get(`/api/v1/invoices/${inv2}`).set(admin);
      assert.equal(inv.body.data.workflowStatus, 'teilabgerechnet');

      const del = await request(app).delete(`/api/v1/billings/${delBilling}`).set(admin);
      assert.equal(del.status, 204);

      inv = await request(app).get(`/api/v1/invoices/${inv2}`).set(admin);
      assert.equal(inv.body.data.workflowStatus, 'eingereicht');
      assert.equal(Number(inv.body.data.reimbursedTotal), 0);
    });

    await t.test(
      'allocation across submissions violates the same-submission invariant',
      async () => {
        const loose = await makeInvoice(accountA, 100, 'R-loose'); // never submitted
        const res = await post(`/api/v1/billings/${billingUID}/allocations`, {
          entries: [{ invoiceUID: loose, reimbursement: 50 }],
        });
        assert.equal(res.status, 400);
      },
    );

    const plan = async (
      account: string,
      query = 'year=2024',
      headers: Record<string, string> = admin,
    ) => request(app).get(`/api/v1/accounts/${account}/reimbursement-plan?${query}`).set(headers);
    type PlanInvoice = {
      invoiceUID: string;
      action: string;
      policies: Array<{ contractUID: string; action: string; reimbursement: number }>;
    };
    type PlanPolicy = Record<string, unknown> & { contractUID: string };
    const planPolicy = (body: { data: { policies: PlanPolicy[] } }, uid: string) =>
      body.data.policies.find((p) => p.contractUID === uid);
    const planInvoice = (body: { data: { invoices: PlanInvoice[] } }, uid: string) =>
      body.data.invoices.find((i) => i.invoiceUID === uid);

    await t.test('the reimbursement plan builds on the recorded reality', async () => {
      const res = await plan(accountA);
      assert.equal(res.status, 200);
      // account A's active 2024 invoices: 500 + 500 + the 100 "loose" one = 1100.
      assert.equal(res.body.data.invoiceTotal, 1100);
      const x = planPolicy(res.body, contractA);
      assert.equal(x?.deductible, 300);
      // The 200 € reimbursement already forfeited the year, so x is simply used.
      assert.equal(x?.bonusStatus, 'forfeited');
      assert.equal(x?.recommendation, 'use');
      assert.equal(x?.actualReimbursement, 200);
      // The answered 500 € invoice used up the deductible (500 - 200 paid > 300),
      // so the rest is modelled in full: 200 actual + 500 + 100.
      assert.equal(x?.expectedReimbursement, 800);
      assert.equal(planInvoice(res.body, inv1)?.policies[0]?.action, 'answered');
      assert.equal(planInvoice(res.body, inv2)?.action, 'done');
      const loose = res.body.data.invoices.find(
        (i: PlanInvoice & { invoiceNumber: string }) => i.invoiceNumber === 'R-loose',
      );
      assert.equal(loose?.action, 'submit');

      const badYear = await plan(accountA, 'year=abc');
      assert.equal(badYear.status, 400);
      const scoped = await scopedNutzer(pool, app, 'plan-scope@example.com', accountB);
      assert.equal((await plan(accountA, 'year=2024', scoped)).status, 403);
      assert.equal((await plan(accountB, 'year=2024', scoped)).status, 200);

      // All of account A's invoices were treated in 2024.
      const years = await request(app)
        .get(`/api/v1/invoices/years?accountUID=${accountA}`)
        .set(admin);
      assert.equal(years.status, 200);
      assert.deepEqual(years.body.data, [2024]);
    });

    const contractY = (
      await post('/api/v1/contracts', {
        contractNumber: 'ZV-Y',
        companyUID,
        accountUID: accountA,
        contractKind: 'SUPPLEMENTARY',
        contractBegin: '2020-01-01',
        initialDeductible: 0,
      })
    ).body.data.contractUID as string;
    const invoice = async (uid: string) =>
      (await request(app).get(`/api/v1/invoices/${uid}`).set(admin)).body.data;

    let submissionY = '';
    await t.test('the remainder can be submitted to a second policy, once', async () => {
      const res = await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-01',
        invoiceUIDs: [inv1],
      });
      assert.equal(res.status, 201);
      submissionY = res.body.data.submissionUID;

      const inv = await invoice(inv1);
      assert.equal(inv.workflowStatus, 'teilabgerechnet');
      assert.deepEqual(
        inv.submissions.map((s: { contractNumber: string; status: string }) => [
          s.contractNumber,
          s.status,
        ]),
        [
          ['PKV-A', 'abgerechnet'],
          ['ZV-Y', 'eingereicht'],
        ],
      );

      const again = await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-02',
        invoiceUIDs: [inv1],
      });
      assert.equal(again.status, 409);
    });

    await t.test('reimbursements over all policies never exceed the invoice amount', async () => {
      const billingY = (
        await post('/api/v1/billings', {
          submissionUID: submissionY,
          billingDate: '2024-08-20',
          billingNumber: 'ZV-LA-1',
        })
      ).body.data.billingUID as string;

      const tooMuch = await post(`/api/v1/billings/${billingY}/allocations`, {
        entries: [{ invoiceUID: inv1, reimbursement: 300.01 }],
      });
      assert.equal(tooMuch.status, 409);

      const rest = await post(`/api/v1/billings/${billingY}/allocations`, {
        entries: [{ invoiceUID: inv1, reimbursement: 300 }],
      });
      assert.equal(rest.status, 201);

      const inv = await invoice(inv1);
      assert.equal(inv.workflowStatus, 'abgerechnet');
      assert.equal(inv.remainingAmount, 0);

      const lowered = await request(app)
        .patch(`/api/v1/invoices/${inv1}`)
        .set(admin)
        .send({ invoiceAmount: 499.99 });
      assert.equal(lowered.status, 409);
    });

    await t.test('settling a fully reimbursed invoice moves it to erledigt', async () => {
      const res = await request(app)
        .patch(`/api/v1/invoices/${inv1}`)
        .set(admin)
        .send({ transferDate: '2024-09-01' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.workflowStatus, 'erledigt');
    });

    await t.test('the plan counts each policy’s own reimbursements', async () => {
      const res = await plan(accountA);
      assert.equal(planPolicy(res.body, contractA)?.actualReimbursement, 200);
      assert.equal(planPolicy(res.body, contractY)?.actualReimbursement, 300);
      assert.equal(planPolicy(res.body, contractY)?.contractKind, 'SUPPLEMENTARY');
    });

    await t.test('an exclusion blocks submitting to that policy', async () => {
      const marked = await post(`/api/v1/invoices/${inv2}/exclusions`, {
        contractUID: contractY,
        note: 'Stationär',
      });
      assert.equal(marked.status, 201);
      assert.deepEqual(marked.body.data.exclusions, [
        {
          contractUID: contractY,
          contractNumber: 'ZV-Y',
          companyName: 'Kranken AG',
          note: 'Stationär',
        },
      ]);

      const duplicate = await post(`/api/v1/invoices/${inv2}/exclusions`, {
        contractUID: contractY,
      });
      assert.equal(duplicate.status, 409);

      const submit = await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-03',
        invoiceUIDs: [inv2],
      });
      assert.equal(submit.status, 409);

      // The plan leaves the excluded invoice out at that policy.
      const excludedAt = planInvoice((await plan(accountA)).body, inv2)?.policies.find(
        (p) => p.contractUID === contractY,
      );
      assert.equal(excludedAt?.action, 'excluded');

      const alreadySubmitted = await post(`/api/v1/invoices/${inv1}/exclusions`, {
        contractUID: contractY,
      });
      assert.equal(alreadySubmitted.status, 409);

      const removed = await request(app)
        .delete(`/api/v1/invoices/${inv2}/exclusions/${contractY}`)
        .set(admin);
      assert.equal(removed.status, 204);
      assert.deepEqual((await invoice(inv2)).exclusions, []);
    });

    await t.test('a submission can be withdrawn only while it has no billing', async () => {
      const withBilling = await request(app)
        .delete(`/api/v1/submissions/${submissionUID}/invoices/${inv2}`)
        .set(admin);
      assert.equal(withBilling.status, 409);

      const inv4 = await makeInvoice(accountA, 80, 'R-4');
      const wrong = (
        await post('/api/v1/submissions', {
          contractUID: contractY,
          submittedDate: '2024-08-04',
          invoiceUIDs: [inv4],
        })
      ).body.data.submissionUID as string;

      const res = await request(app)
        .delete(`/api/v1/submissions/${wrong}/invoices/${inv4}`)
        .set(admin);
      assert.equal(res.status, 204);
      assert.equal((await invoice(inv4)).workflowStatus, 'offen');
      // The emptied submission is gone.
      const gone = await request(app).get(`/api/v1/submissions/${wrong}`).set(admin);
      assert.equal(gone.status, 404);

      const unsubmittedMark = await request(app)
        .patch(`/api/v1/invoices/${inv4}`)
        .set(admin)
        .send({ reimbursementClosed: true });
      assert.equal(unsubmittedMark.status, 409);
    });

    await t.test('marking as billed closes a partial reimbursement', async () => {
      const marked = await request(app)
        .patch(`/api/v1/invoices/${inv2}`)
        .set(admin)
        .send({ reimbursementClosed: true });
      assert.equal(marked.status, 200);
      assert.equal(marked.body.data.reimbursementClosed, true);
      assert.equal(marked.body.data.workflowStatus, 'abgerechnet');

      const closedSubmit = await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-05',
        invoiceUIDs: [inv2],
      });
      assert.equal(closedSubmit.status, 409);

      const paid = await request(app)
        .patch(`/api/v1/invoices/${inv2}`)
        .set(admin)
        .send({ transferDate: '2024-09-02' });
      assert.equal(paid.body.data.workflowStatus, 'erledigt');
    });

    await t.test('removing an allocation frees the invoice again', async () => {
      const inv5 = await makeInvoice(accountA, 120, 'R-5');
      const submission = (
        await post('/api/v1/submissions', {
          contractUID: contractY,
          submittedDate: '2024-08-06',
          invoiceUIDs: [inv5],
        })
      ).body.data.submissionUID as string;
      const billing = (
        await post('/api/v1/billings', {
          submissionUID: submission,
          billingDate: '2024-08-25',
          billingNumber: 'ZV-LA-2',
        })
      ).body.data.billingUID as string;
      const allocationUID = (
        await post(`/api/v1/billings/${billing}/allocations`, {
          entries: [{ invoiceUID: inv5, reimbursement: 50 }],
        })
      ).body.data[0].allocationUID as string;

      const res = await request(app).delete(`/api/v1/allocations/${allocationUID}`).set(admin);
      assert.equal(res.status, 204);

      const inv = await invoice(inv5);
      assert.deepEqual(inv.submissions[0].allocations, []);
      assert.equal(inv.submissions[0].status, 'eingereicht');
      assert.equal(inv.workflowStatus, 'eingereicht');
      assert.equal(inv.remainingAmount, 120);
    });

    // Slice 34: correcting a booked reimbursement instead of unbooking it.
    await t.test('a booked reimbursement can be corrected', async () => {
      const inv6 = await makeInvoice(accountA, 200, 'R-6');
      const submission = (
        await post('/api/v1/submissions', {
          contractUID: contractY,
          submittedDate: '2024-08-07',
          invoiceUIDs: [inv6],
        })
      ).body.data.submissionUID as string;
      const billing = (
        await post('/api/v1/billings', {
          submissionUID: submission,
          billingDate: '2024-08-26',
          billingNumber: 'ZV-LA-3',
        })
      ).body.data.billingUID as string;
      const allocationUID = (
        await post(`/api/v1/billings/${billing}/allocations`, {
          entries: [{ invoiceUID: inv6, reimbursement: 100, receiptNumber: 'BEL-6' }],
        })
      ).body.data[0].allocationUID as string;

      const patch = (body: object, headers: Record<string, string> = admin) =>
        request(app).patch(`/api/v1/allocations/${allocationUID}`).set(headers).send(body);

      // The full amount although 100 of it is this very booking: the "no
      // enrichment" rule is measured without it, otherwise it blocks itself.
      const raised = await patch({ reimbursement: 200, receiptNumber: 'BEL-6a' });
      assert.equal(raised.status, 200);

      const full = await invoice(inv6);
      assert.equal(full.workflowStatus, 'abgerechnet');
      assert.equal(Number(full.reimbursedTotal), 200);
      assert.equal(full.remainingAmount, 0);
      assert.equal(full.submissions[0].allocations[0].receiptNumber, 'BEL-6a');

      const tooMuch = await patch({ reimbursement: 200.01 });
      assert.equal(tooMuch.status, 409);
      assert.equal(tooMuch.body.error.code, 'REIMBURSEMENT_EXCEEDS_INVOICE');
      assert.deepEqual(tooMuch.body.error.details, { invoices: ['R-6'] });

      // Lowering it again frees the rest of the invoice, and the receipt
      // number can be cleared on its own.
      const lowered = await patch({ reimbursement: 60, receiptNumber: null });
      assert.equal(lowered.status, 200);
      const partial = await invoice(inv6);
      assert.equal(partial.workflowStatus, 'teilabgerechnet');
      assert.equal(partial.remainingAmount, 140);
      assert.equal(partial.submissions[0].allocations[0].receiptNumber, null);

      const unknown = await request(app)
        .patch('/api/v1/allocations/ALLOC-does-not-exist')
        .set(admin)
        .send({ reimbursement: 1 });
      assert.equal(unknown.status, 404);

      const foreign = await scopedNutzer(pool, app, 'scoped-alloc@example.com', accountB);
      assert.equal((await patch({ reimbursement: 1 }, foreign)).status, 403);
    });

    // Slice 22: booking one Leistungsabrechnung over several invoices, and the
    // filters the "Leistungsabrechnung auswählen" sub-dialog searches with.
    const contractB = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-B',
        companyUID,
        accountUID: accountB,
        contractBegin: '2020-01-01',
        initialDeductible: 0,
      })
    ).body.data.contractUID as string;
    const invB1 = await makeInvoice(accountB, 200, 'R-B1');
    const invB2 = await makeInvoice(accountB, 300, 'R-B2');
    const submissionB = (
      await post('/api/v1/submissions', {
        contractUID: contractB,
        submittedDate: '2024-08-01',
        invoiceUIDs: [invB1, invB2],
      })
    ).body.data.submissionUID as string;
    const billingB = (
      await post('/api/v1/billings', {
        submissionUID: submissionB,
        billingDate: '2024-08-10',
        billingNumber: 'LA-B1',
      })
    ).body.data.billingUID as string;

    const billings = async (query: string): Promise<Array<{ billingUID: string }>> =>
      (await request(app).get(`/api/v1/billings?contractUID=${contractB}&${query}`).set(admin)).body
        .data;

    await t.test('a billing without reimbursements is found as "unverknüpft"', async () => {
      const found = await billings('unlinked=true');
      assert.deepEqual(
        found.map((b) => b.billingUID),
        [billingB],
      );
    });

    await t.test('a rejected entry books none of the others', async () => {
      const loose = await makeInvoice(accountB, 100, 'R-B-loose'); // never submitted
      const res = await post(`/api/v1/billings/${billingB}/allocations`, {
        entries: [
          { invoiceUID: invB1, reimbursement: 100 },
          { invoiceUID: loose, reimbursement: 50 },
        ],
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /R-B-loose/);
      // The UI translates the code and names the invoices from the details.
      assert.equal(res.body.error.code, 'INVOICES_NOT_IN_SUBMISSION');
      assert.deepEqual(res.body.error.details, { invoices: ['R-B-loose'] });

      const inv = await request(app).get(`/api/v1/invoices/${invB1}`).set(admin);
      assert.equal(inv.body.data.workflowStatus, 'eingereicht');
      assert.equal(Number(inv.body.data.reimbursedTotal), 0);
    });

    await t.test('the same invoice cannot be booked twice in one request', async () => {
      const res = await post(`/api/v1/billings/${billingB}/allocations`, {
        entries: [
          { invoiceUID: invB1, reimbursement: 10 },
          { invoiceUID: invB1, reimbursement: 20 },
        ],
      });
      assert.equal(res.status, 400);
    });

    await t.test('an over-reimbursement names the offending invoice', async () => {
      const res = await post(`/api/v1/billings/${billingB}/allocations`, {
        entries: [
          { invoiceUID: invB1, reimbursement: 100 },
          { invoiceUID: invB2, reimbursement: 300.01 },
        ],
      });
      assert.equal(res.status, 409);
      assert.match(res.body.error.message, /R-B2/);
      assert.equal(res.body.error.code, 'REIMBURSEMENT_EXCEEDS_INVOICE');
      assert.deepEqual(res.body.error.details, { invoices: ['R-B2'] });
    });

    await t.test('one request books the reimbursements of both invoices', async () => {
      const res = await post(`/api/v1/billings/${billingB}/allocations`, {
        entries: [
          { invoiceUID: invB1, reimbursement: 100, receiptNumber: 'BEL-B1' },
          { invoiceUID: invB2, reimbursement: 300 },
        ],
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.length, 2);

      const first = await request(app).get(`/api/v1/invoices/${invB1}`).set(admin);
      assert.equal(first.body.data.workflowStatus, 'teilabgerechnet');
      assert.equal(first.body.data.submissions[0].allocations[0].receiptNumber, 'BEL-B1');
      const second = await request(app).get(`/api/v1/invoices/${invB2}`).set(admin);
      assert.equal(second.body.data.workflowStatus, 'abgerechnet');
      assert.equal(Number(second.body.data.reimbursedTotal), 300);
    });

    await t.test('the billing filters narrow the list', async () => {
      assert.deepEqual(await billings('unlinked=true'), [], 'it is linked now');

      const byNumber = await billings('q=LA-B1');
      assert.deepEqual(
        byNumber.map((b) => b.billingUID),
        [billingB],
      );
      const byInvoiceNumber = await billings('q=R-B2');
      assert.deepEqual(
        byInvoiceNumber.map((b) => b.billingUID),
        [billingB],
        'the free text also matches the invoice numbers behind the billing',
      );
      assert.deepEqual(await billings('q=gibtesnicht'), []);

      assert.equal((await billings('from=2024-08-10&to=2024-08-10')).length, 1);
      assert.deepEqual(await billings('from=2024-08-11'), []);
      assert.deepEqual(await billings('to=2024-08-09'), []);

      assert.equal((await billings('minReimbursement=400&maxReimbursement=400')).length, 1);
      assert.deepEqual(await billings('minReimbursement=400.01'), []);
      assert.deepEqual(await billings('maxReimbursement=399.99'), []);

      assert.equal((await billings('limit=1')).length, 1);
    });

    await t.test('an unusable filter is rejected with a named parameter', async () => {
      const res = await request(app).get('/api/v1/billings?from=irgendwann').set(admin);
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /from/);

      const limit = await request(app).get('/api/v1/billings?limit=0').set(admin);
      assert.equal(limit.status, 400);
    });

    await t.test('booking is refused for a foreign account', async () => {
      const user = await scopedNutzer(pool, app, 'scoped-b@example.com', accountA);
      const res = await post(
        `/api/v1/billings/${billingB}/allocations`,
        { entries: [{ invoiceUID: invB1, reimbursement: 1 }] },
        user,
      );
      assert.equal(res.status, 403);
    });

    await t.test('account scoping: a scoped user is confined to their account', async () => {
      const user = await scopedNutzer(pool, app, 'user@example.com', accountA);

      const list = await request(app).get('/api/v1/invoices').set(user);
      assert.equal(list.status, 200);
      assert.ok(
        list.body.data.every((inv: { accountUID: string }) => inv.accountUID === accountA),
        'scoped user only sees their account',
      );

      // Nutzer has MANAGE_INVOICES: may create for their account, not for another.
      const own = await post(
        '/api/v1/invoices',
        {
          invoiceNumber: 'R-own',
          invoiceDate: '2024-09-01',
          treatmentDate: '2024-09-01',
          accountUID: accountA,
          invoiceAmount: 50,
        },
        user,
      );
      assert.equal(own.status, 201);

      const foreign = await post(
        '/api/v1/invoices',
        {
          invoiceNumber: 'R-foreign',
          invoiceDate: '2024-09-01',
          treatmentDate: '2024-09-01',
          accountUID: accountB,
          invoiceAmount: 50,
        },
        user,
      );
      assert.equal(foreign.status, 403);
    });
  } finally {
    await pool.end();
  }
});
