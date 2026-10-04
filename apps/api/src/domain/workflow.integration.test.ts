import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import type { Row } from '../crud/repository.js';
import { hashPassword } from '../lib/password.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

/**
 * Whether the reported validation issues include a length complaint about this
 * field — the way an upper bound is pinned without depending on which other
 * rule a deliberately oversized list also breaks (SEC-11).
 */
function tooBigOn(details: unknown, field: string): boolean {
  return (
    Array.isArray(details) &&
    details.some(
      (issue) =>
        typeof issue === 'object' &&
        issue !== null &&
        (issue as { code?: unknown }).code === 'too_big' &&
        Array.isArray((issue as { path?: unknown }).path) &&
        (issue as { path: unknown[] }).path.includes(field),
    )
  );
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

/** A login with no role at all: authenticated, with nothing in scope. */
async function userWithoutGrants(
  pool: Pool,
  app: ReturnType<typeof createApp>,
  email: string,
): Promise<Record<string, string>> {
  const password = 'nograntuser1';
  await pool.query('INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)', [
    email,
    'Ohne',
    await hashPassword(password),
  ]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { Authorization: `Bearer ${login.body.accessToken}` };
}

test('invoice workflow: full loop, invariants and scoping', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    /**
     * The app on a counted pool. CR-16 was a query count that grew with the
     * data, so the proof is a number rather than a promise: the same request
     * over more policies has to cost the same. Nothing but a request runs
     * against this pool — `createApp` starts no timers — so the count is the
     * request's own.
     */
    let queries = 0;
    const counting = new Proxy(pool, {
      get(target, prop) {
        if (prop === 'query') {
          return (...args: Parameters<Pool['query']>) => {
            queries += 1;
            return target.query(...args);
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const countQueries = async (run: () => Promise<unknown>): Promise<number> => {
      queries = 0;
      await run();
      return queries;
    };
    const app = createApp({ pool: counting, config });

    const { admin } = await bootstrapAdmin(app);

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
          contractUID: contractA,
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
          contractUID: contractA,
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

    await t.test('the remainder can be submitted to a second policy, once', async () => {
      const res = await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-01',
        invoiceUIDs: [inv1],
      });
      assert.equal(res.status, 201);

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
          contractUID: contractY,
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

    // Slice 37: the lock sits on the invoice, not on the submission — a
    // billing spans submissions now, so a sibling nobody answered stays free.
    await t.test('an invoice is withdrawn only while nothing was reimbursed here', async () => {
      const reimbursed = await request(app)
        .delete(`/api/v1/submissions/${submissionUID}/invoices/${inv1}`)
        .set(admin);
      assert.equal(reimbursed.status, 409);
      assert.equal(reimbursed.body.error.code, 'INVOICE_HAS_REIMBURSEMENT');

      const sibA = await makeInvoice(accountA, 90, 'R-SIB-A');
      const sibB = await makeInvoice(accountA, 90, 'R-SIB-B');
      const together = (
        await post('/api/v1/submissions', {
          contractUID: contractY,
          submittedDate: '2024-08-04',
          invoiceUIDs: [sibA, sibB],
        })
      ).body.data.submissionUID as string;
      const sibBilling = (
        await post('/api/v1/billings', {
          contractUID: contractY,
          billingDate: '2024-08-21',
          billingNumber: 'ZV-LA-SIB',
        })
      ).body.data.billingUID as string;
      await post(`/api/v1/billings/${sibBilling}/allocations`, {
        entries: [{ invoiceUID: sibA, reimbursement: 40 }],
      });

      const answered = await request(app)
        .delete(`/api/v1/submissions/${together}/invoices/${sibA}`)
        .set(admin);
      assert.equal(answered.status, 409);

      // The sibling comes back although their submission has been billed.
      const untouched = await request(app)
        .delete(`/api/v1/submissions/${together}/invoices/${sibB}`)
        .set(admin);
      assert.equal(untouched.status, 204);
      assert.equal((await invoice(sibB)).workflowStatus, 'offen');

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
      await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-06',
        invoiceUIDs: [inv5],
      });
      const billing = (
        await post('/api/v1/billings', {
          contractUID: contractY,
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
      await post('/api/v1/submissions', {
        contractUID: contractY,
        submittedDate: '2024-08-07',
        invoiceUIDs: [inv6],
      });
      const billing = (
        await post('/api/v1/billings', {
          contractUID: contractY,
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
    await post('/api/v1/submissions', {
      contractUID: contractB,
      submittedDate: '2024-08-01',
      invoiceUIDs: [invB1, invB2],
    });
    const billingB = (
      await post('/api/v1/billings', {
        contractUID: contractB,
        billingDate: '2024-08-10',
        billingNumber: 'LA-B1',
      })
    ).body.data.billingUID as string;

    const billings = async (
      query: string,
    ): Promise<Array<{ billingUID: string; invoiceNumbers: string | null }>> =>
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
      assert.equal(res.body.error.code, 'INVOICES_NOT_SUBMITTED_HERE');
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
      // The rows come back in the order they were sent — the entries are
      // written in one statement now (CR-18), and the answer is that list.
      assert.deepEqual(
        res.body.data.map((row: Row) => row.invoiceUID),
        [invB1, invB2],
      );

      const first = await request(app).get(`/api/v1/invoices/${invB1}`).set(admin);
      assert.equal(first.body.data.workflowStatus, 'teilabgerechnet');
      assert.equal(first.body.data.submissions[0].allocations[0].receiptNumber, 'BEL-B1');
      const second = await request(app).get(`/api/v1/invoices/${invB2}`).set(admin);
      assert.equal(second.body.data.workflowStatus, 'abgerechnet');
      assert.equal(Number(second.body.data.reimbursedTotal), 300);
    });

    await t.test('a receipt number on the second entry alone is kept', async () => {
      // One statement means one column list for every row, so the columns are
      // the union over all entries. Were they taken from the first entry, this
      // receipt number would be dropped without a word (CR-18).
      const invB3 = await makeInvoice(accountB, 50, 'R-B3');
      const invB4 = await makeInvoice(accountB, 50, 'R-B4');
      await post('/api/v1/submissions', {
        contractUID: contractB,
        submittedDate: '2024-06-01',
        invoiceUIDs: [invB3, invB4],
      });
      const billing = (
        await post('/api/v1/billings', {
          contractUID: contractB,
          billingDate: '2024-06-10',
          billingNumber: 'LA-B-receipts',
        })
      ).body.data.billingUID as string;

      const res = await post(`/api/v1/billings/${billing}/allocations`, {
        entries: [
          { invoiceUID: invB3, reimbursement: 10 },
          { invoiceUID: invB4, reimbursement: 20, receiptNumber: 'BEL-B4' },
        ],
      });
      assert.equal(res.status, 201);
      assert.deepEqual(
        res.body.data.map((row: Row) => row.receiptNumber),
        [null, 'BEL-B4'],
      );

      // Taken back out again: the filters this policy's list is asserted with
      // further down count what is in it, down to the single row.
      assert.equal(
        (await request(app).delete(`/api/v1/billings/${billing}`).set(admin)).status,
        204,
      );
      for (const uid of [invB3, invB4]) {
        assert.equal((await request(app).delete(`/api/v1/invoices/${uid}`).set(admin)).status, 204);
      }
    });

    await t.test('more booked entries than a letter can carry are refused', async () => {
      // The upper bound matters because every entry is its own row in ONE
      // transaction, with every invoice locked FOR UPDATE (SEC-11). Asserted on
      // the issue itself: such a list fails other rules too, and the point here
      // is that the length is one of them.
      const entries = Array.from({ length: 201 }, () => ({
        invoiceUID: invB1,
        reimbursement: 1,
      }));
      const res = await post(`/api/v1/billings/${billingB}/allocations`, { entries });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(tooBigOn(res.body.error.details, 'entries'));
    });

    await t.test('more invoices in one submission than the bound allows are refused', async () => {
      const res = await post('/api/v1/submissions', {
        contractUID: contractB,
        submittedDate: '2024-09-01',
        invoiceUIDs: Array.from({ length: 201 }, () => invB1),
      });
      assert.equal(res.status, 400);
      assert.ok(tooBigOn(res.body.error.details, 'invoiceUIDs'));
    });

    await t.test('a document link a browser would execute is refused', async () => {
      // zod's `.url()` takes these; only the scheme check turns them down
      // (SEC-01). Both endpoints that carry a link are asked.
      for (const documentLink of [
        'javascript:alert(document.domain)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
      ]) {
        const invoice = await post('/api/v1/invoices', {
          invoiceNumber: `R-link-${documentLink.slice(0, 4)}`,
          invoiceDate: '2024-05-01',
          treatmentDate: '2024-05-01',
          accountUID: accountB,
          invoiceAmount: 10,
          documentLink,
        });
        assert.equal(invoice.status, 400, documentLink);
        assert.equal(invoice.body.error.code, 'VALIDATION_ERROR');

        const billing = await post('/api/v1/billings', {
          contractUID: contractB,
          billingDate: '2024-08-10',
          billingNumber: `LA-link-${documentLink.slice(0, 4)}`,
          documentLink,
        });
        assert.equal(billing.status, 400, documentLink);
      }
    });

    await t.test('an http(s) document link is stored on both', async () => {
      const link = 'https://docs.example/invoice.pdf';
      const invoice = await post('/api/v1/invoices', {
        invoiceNumber: 'R-link-ok',
        invoiceDate: '2024-05-01',
        treatmentDate: '2024-05-01',
        accountUID: accountB,
        invoiceAmount: 10,
        documentLink: link,
      });
      assert.equal(invoice.status, 201);
      assert.equal(invoice.body.data.documentLink, link);

      const billing = await post('/api/v1/billings', {
        contractUID: contractB,
        billingDate: '2024-08-10',
        billingNumber: 'LA-link-ok',
        documentLink: link,
      });
      assert.equal(billing.status, 201);
      assert.equal(billing.body.data.documentLink, link);

      // Both are taken back out: the suites after this one read the lists of
      // this account and this policy, and count what is in them.
      assert.equal(
        (
          await request(app)
            .delete(`/api/v1/billings/${billing.body.data.billingUID as string}`)
            .set(admin)
        ).status,
        204,
      );
      assert.equal(
        (
          await request(app)
            .delete(`/api/v1/invoices/${invoice.body.data.invoiceUID as string}`)
            .set(admin)
        ).status,
        204,
      );
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
      assert.deepEqual(
        byInvoiceNumber[0]?.invoiceNumbers,
        'R-B1, R-B2',
        'the invoice numbers come from their own query now, not a GROUP_CONCAT',
      );
      assert.deepEqual(await billings('q=gibtesnicht'), []);
      assert.deepEqual(await billings('q=%25'), [], 'the wildcards are escaped here too');

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

    /*
     * CR-16: the plan used to ask five questions per policy — the terms, the
     * claims, the year records, the terms again and their bonus tiers. They are
     * four questions for all policies now, so account A with two policies has
     * to cost exactly what account B with one costs.
     */
    await t.test('the reimbursement plan asks the same of one policy and of two', async () => {
      const policiesOf = async (account: string): Promise<number> =>
        (await plan(account)).body.data.policies.length;
      assert.equal(await policiesOf(accountB), 1);
      assert.equal(await policiesOf(accountA), 2);

      const forOne = await countQueries(() => plan(accountB));
      const forTwo = await countQueries(() => plan(accountA));
      assert.equal(forTwo, forOne, 'the second policy costs no further query');
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

    /*
     * CR-07: all seven list endpoints ask the same question through the same
     * `accountFilter`, so its two ends are worth one test instead of seven. A
     * login without any grant sees nothing anywhere — the branch that answers
     * without asking the database at all — and a login scoped to account A sees
     * A's rows and none of B's.
     */
    await t.test('every list endpoint honours the one account rule', async () => {
      const lists = [
        '/api/v1/accounts',
        '/api/v1/contracts',
        '/api/v1/invoices',
        '/api/v1/invoices/years',
        '/api/v1/submissions',
        '/api/v1/allocations',
        '/api/v1/billings',
      ];

      const nobody = await userWithoutGrants(pool, app, 'nobody@example.com');
      for (const path of lists) {
        const res = await request(app).get(path).set(nobody);
        assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
        assert.deepEqual(res.body.data, [], `${path} answers empty without a grant`);
      }

      const scoped = await scopedNutzer(pool, app, 'lists-scope@example.com', accountA);
      const rowsFor = async (path: string, headers = scoped): Promise<Row[]> => {
        const res = await request(app).get(path).set(headers);
        assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
        return res.body.data as Row[];
      };

      // Five of the lists carry the account on every row.
      for (const path of [
        '/api/v1/accounts',
        '/api/v1/contracts',
        '/api/v1/invoices',
        '/api/v1/submissions',
        '/api/v1/billings',
      ]) {
        const rows = await rowsFor(path);
        assert.ok(rows.length > 0, `${path} still answers for a scoped user`);
        assert.deepEqual(
          [...new Set(rows.map((row) => row.accountUID))],
          [accountA],
          `${path} shows account A only`,
        );
        // The filter has something to exclude: the admin sees more.
        assert.ok(
          (await rowsFor(path, admin)).length > rows.length,
          `${path} hides B's rows from the scoped user`,
        );
      }

      // CR-27: the policy list takes the insured person as a filter, like the
      // invoice and billing searches — and refuses the account the user may not
      // see instead of answering with an empty list.
      const ownPolicies = await rowsFor(`/api/v1/contracts?accountUID=${accountA}`);
      assert.ok(ownPolicies.length > 0);
      assert.deepEqual([...new Set(ownPolicies.map((row) => row.accountUID))], [accountA]);
      assert.equal(
        (await request(app).get(`/api/v1/contracts?accountUID=${accountB}`).set(scoped)).status,
        403,
      );
      assert.equal(
        (await request(app).get('/api/v1/contracts?accountUID=not-a-uid').set(admin)).status,
        400,
      );

      // Allocations name no account of their own; B's booking is the proof.
      const allocations = await rowsFor('/api/v1/allocations');
      assert.ok(allocations.length > 0);
      assert.ok(
        !allocations.some((row) => row.invoiceUID === invB1),
        "B's reimbursement is not in the scoped list",
      );
      assert.ok(
        (await rowsFor('/api/v1/allocations', admin)).some((row) => row.invoiceUID === invB1),
      );
    });

    // Slice 36: finding an invoice by its number alone (issues.md 6).
    await t.test('an invoice is found by its number, without account or year', async () => {
      const old = await post('/api/v1/invoices', {
        invoiceNumber: 'R-2019-XYZ',
        invoiceDate: '2019-03-01',
        treatmentDate: '2019-03-01',
        accountUID: accountA,
        invoiceAmount: 75,
      });
      assert.equal(old.status, 201);

      const hits = await request(app).get('/api/v1/invoices?q=2019-XYZ').set(admin);
      assert.equal(hits.status, 200);
      assert.deepEqual(
        hits.body.data.map((i: { invoiceUID: string }) => i.invoiceUID),
        [old.body.data.invoiceUID],
      );

      // The search is over the number only, and it is a substring match.
      assert.equal(
        (await request(app).get('/api/v1/invoices?q=R-2019').set(admin)).body.data.length,
        1,
      );
      assert.equal(
        (await request(app).get('/api/v1/invoices?q=Bea').set(admin)).body.data.length,
        0,
      );

      // The LIKE wildcards are escaped: a '%' searches for a percent sign, and
      // a '_' for an underscore — not for everything and every single character.
      assert.deepEqual((await request(app).get('/api/v1/invoices?q=%25').set(admin)).body.data, []);
      assert.deepEqual(
        (await request(app).get('/api/v1/invoices?q=R_2019-XYZ').set(admin)).body.data,
        [],
        'the underscore is a character, not a one-character wildcard',
      );

      // An account still narrows it, and so does the year.
      const forB = (
        await request(app).get(`/api/v1/invoices?q=R-&accountUID=${accountB}`).set(admin)
      ).body.data as Array<{ accountUID: string; invoiceNumber: string }>;
      assert.ok(forB.every((i) => i.accountUID === accountB));
      assert.ok(forB.some((i) => i.invoiceNumber === 'R-B1'));
      assert.equal(
        (await request(app).get('/api/v1/invoices?q=R-2019-XYZ&year=2024').set(admin)).body.data
          .length,
        0,
      );

      const limited = await request(app).get('/api/v1/invoices?q=R-&limit=2').set(admin);
      assert.equal(limited.body.data.length, 2);

      // The search stays inside what the user may see.
      const scoped = await scopedNutzer(pool, app, 'search-scope@example.com', accountB);
      const denied = await request(app).get('/api/v1/invoices?q=R-2019-XYZ').set(scoped);
      assert.equal(denied.status, 200);
      assert.deepEqual(denied.body.data, []);

      // A query parameter that makes no sense is named, not ignored.
      const bad = await request(app).get('/api/v1/invoices?year=abc').set(admin);
      assert.equal(bad.status, 400);
    });

    // Slice 37: a Leistungsabrechnung belongs to the policy, so one letter of
    // the insurer settles invoices that were handed in on different days —
    // and the same number never appears twice under one policy.
    const contractC = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-C',
        companyUID,
        accountUID: accountB,
        contractBegin: '2020-01-01',
        initialDeductible: 0,
      })
    ).body.data.contractUID as string;

    await t.test('one billing settles invoices from two separate submissions', async () => {
      const early = await makeInvoice(accountB, 100, 'R-C-EARLY');
      const late = await makeInvoice(accountB, 100, 'R-C-LATE');
      await post('/api/v1/submissions', {
        contractUID: contractC,
        submittedDate: '2024-03-01',
        invoiceUIDs: [early],
      });
      await post('/api/v1/submissions', {
        contractUID: contractC,
        submittedDate: '2024-09-01',
        invoiceUIDs: [late],
      });

      const billing = (
        await post('/api/v1/billings', {
          contractUID: contractC,
          billingDate: '2024-10-01',
          billingNumber: 'LA-C-1',
        })
      ).body.data.billingUID as string;

      const res = await post(`/api/v1/billings/${billing}/allocations`, {
        entries: [
          { invoiceUID: early, reimbursement: 60 },
          { invoiceUID: late, reimbursement: 70 },
        ],
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.length, 2);

      for (const uid of [early, late]) {
        const inv = await request(app).get(`/api/v1/invoices/${uid}`).set(admin);
        assert.equal(inv.body.data.workflowStatus, 'teilabgerechnet');
        assert.equal(inv.body.data.submissions[0].status, 'abgerechnet');
        assert.equal(inv.body.data.submissions[0].allocations[0].billingNumber, 'LA-C-1');
        assert.equal(inv.body.data.submissions[0].billingCount, 1);
      }
    });

    await t.test('an invoice submitted to another policy cannot be booked here', async () => {
      const elsewhere = await makeInvoice(accountB, 100, 'R-C-ELSE');
      await post('/api/v1/submissions', {
        contractUID: contractB,
        submittedDate: '2024-10-02',
        invoiceUIDs: [elsewhere],
      });
      const billing = (
        await post('/api/v1/billings', {
          contractUID: contractC,
          billingDate: '2024-10-03',
          billingNumber: 'LA-C-2',
        })
      ).body.data.billingUID as string;

      const res = await post(`/api/v1/billings/${billing}/allocations`, {
        entries: [{ invoiceUID: elsewhere, reimbursement: 10 }],
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVOICES_NOT_SUBMITTED_HERE');
      assert.deepEqual(res.body.error.details, { invoices: ['R-C-ELSE'] });
    });

    await t.test('a billing number is used once per policy, and freed by deleting', async () => {
      const again = await post('/api/v1/billings', {
        contractUID: contractC,
        billingDate: '2024-10-04',
        billingNumber: 'LA-C-1',
      });
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'BILLING_NUMBER_TAKEN');
      assert.deepEqual(again.body.error.details, { billingNumber: 'LA-C-1' });

      // Another policy may carry the same number: one letter of the insurer
      // can settle two policies (see seed/family-policy.ts).
      const elsewhere = await post('/api/v1/billings', {
        contractUID: contractB,
        billingDate: '2024-10-04',
        billingNumber: 'LA-C-1',
      });
      assert.equal(elsewhere.status, 201);

      // Renaming onto a taken number is refused the same way.
      const rename = await request(app)
        .patch(`/api/v1/billings/${elsewhere.body.data.billingUID}`)
        .set(admin)
        .send({ billingNumber: 'LA-B1' });
      assert.equal(rename.status, 409);
      assert.equal(rename.body.error.code, 'BILLING_NUMBER_TAKEN');

      // A deleted billing gives its number back.
      const spare = await post('/api/v1/billings', {
        contractUID: contractC,
        billingDate: '2024-10-05',
        billingNumber: 'LA-C-SPARE',
      });
      assert.equal(spare.status, 201);
      const dropped = await request(app)
        .delete(`/api/v1/billings/${spare.body.data.billingUID}`)
        .set(admin);
      assert.equal(dropped.status, 204);
      const reused = await post('/api/v1/billings', {
        contractUID: contractC,
        billingDate: '2024-10-06',
        billingNumber: 'LA-C-SPARE',
      });
      assert.equal(reused.status, 201);
    });

    // Slice 41a: an invoice bills several treatment days (issues.md 0.11.0-1).
    // `treatmentDate` stays, as the leading day and as the anchor of every
    // YEAR() evaluation, and the API keeps it on the earliest day.
    await t.test('an invoice that names one day has exactly that day', async () => {
      const res = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
      assert.deepEqual(res.body.data.treatmentDates, ['2024-05-01']);
    });

    await t.test('several days come back sorted, the earliest leading', async () => {
      const created = await post('/api/v1/invoices', {
        invoiceNumber: 'R-DAYS',
        invoiceDate: '2024-07-20',
        // Deliberately not the earliest, and the list unsorted: the API sorts
        // and moves the leading day, the client need not.
        treatmentDate: '2024-07-10',
        treatmentDates: ['2024-07-18', '2024-07-03', '2024-07-10'],
        accountUID: accountB,
        invoiceAmount: 300,
      });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.data.treatmentDates, [
        '2024-07-03',
        '2024-07-10',
        '2024-07-18',
      ]);
      assert.equal(created.body.data.treatmentDate, '2024-07-03');
    });

    await t.test('the list sent replaces the days, and the leading day follows', async () => {
      const uid = (
        await post('/api/v1/invoices', {
          invoiceNumber: 'R-DAYS-2',
          invoiceDate: '2024-08-20',
          treatmentDate: '2024-08-10',
          treatmentDates: ['2024-08-10', '2024-08-11'],
          accountUID: accountB,
          invoiceAmount: 200,
        })
      ).body.data.invoiceUID as string;

      const changed = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ treatmentDates: ['2024-08-02', '2024-08-01'] });
      assert.equal(changed.status, 200);
      assert.deepEqual(changed.body.data.treatmentDates, ['2024-08-01', '2024-08-02']);
      assert.equal(changed.body.data.treatmentDate, '2024-08-01');

      // Only the date, without the list: the leading day MOVES, the others
      // stay — what a client that knows nothing of several days means by it.
      const moved = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ treatmentDate: '2024-08-05' });
      assert.equal(moved.status, 200);
      assert.deepEqual(moved.body.data.treatmentDates, ['2024-08-02', '2024-08-05']);
      assert.equal(moved.body.data.treatmentDate, '2024-08-02');

      // A write that says nothing about the days leaves them alone.
      const elsewhere = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ invoiceAmount: 210 });
      assert.equal(elsewhere.status, 200);
      assert.deepEqual(elsewhere.body.data.treatmentDates, ['2024-08-02', '2024-08-05']);
    });

    await t.test('days from two calendar years are refused, creating and changing', async () => {
      const across = await post('/api/v1/invoices', {
        invoiceNumber: 'R-DAYS-3',
        invoiceDate: '2025-01-10',
        treatmentDate: '2024-12-28',
        treatmentDates: ['2024-12-28', '2025-01-02'],
        accountUID: accountB,
        invoiceAmount: 100,
      });
      assert.equal(across.status, 400);
      assert.equal(across.body.error.code, 'TREATMENT_DAYS_DIFFERENT_YEARS');
      assert.deepEqual(across.body.error.details, { years: ['2024', '2025'] });

      const uid = (
        await post('/api/v1/invoices', {
          invoiceNumber: 'R-DAYS-4',
          invoiceDate: '2024-12-30',
          treatmentDate: '2024-12-28',
          accountUID: accountB,
          invoiceAmount: 100,
        })
      ).body.data.invoiceUID as string;
      const later = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ treatmentDates: ['2024-12-28', '2025-01-02'] });
      assert.equal(later.status, 400);
      assert.equal(later.body.error.code, 'TREATMENT_DAYS_DIFFERENT_YEARS');
      // Refused means unchanged: the transaction rolled back.
      const unchanged = await request(app).get(`/api/v1/invoices/${uid}`).set(admin);
      assert.deepEqual(unchanged.body.data.treatmentDates, ['2024-12-28']);
    });

    // Slice 42: "nicht gedeckt" (issues.md 0.12.0-2). A flag of the invoice, so
    // it holds at every policy — including one taken out later — and the reason
    // is what makes it readable months on.
    await t.test('an invoice can be marked as not covered, with its reason', async () => {
      const created = await post('/api/v1/invoices', {
        invoiceNumber: 'R-NC-1',
        invoiceDate: '2024-09-01',
        treatmentDate: '2024-09-01',
        accountUID: accountB,
        invoiceAmount: 150,
        notCovered: true,
        notCoveredReason: 'Kosmetische Behandlung',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.data.notCovered, true);
      assert.equal(created.body.data.notCoveredReason, 'Kosmetische Behandlung');

      // Dropping the mark drops the reason with it: a reason without a mark
      // would be a dead entry.
      const cleared = await request(app)
        .patch(`/api/v1/invoices/${created.body.data.invoiceUID}`)
        .set(admin)
        .send({ notCovered: false });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.data.notCovered, false);
      assert.equal(cleared.body.data.notCoveredReason, null);
    });

    await t.test('the mark without a reason is refused, creating and changing', async () => {
      const created = await post('/api/v1/invoices', {
        invoiceNumber: 'R-NC-2',
        invoiceDate: '2024-09-02',
        treatmentDate: '2024-09-02',
        accountUID: accountB,
        invoiceAmount: 80,
        notCovered: true,
      });
      assert.equal(created.status, 400);
      assert.equal(created.body.error.code, 'INVOICE_NOT_COVERED_REASON_REQUIRED');

      const uid = await makeInvoice(accountB, 80, 'R-NC-3');
      const changed = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ notCovered: true });
      assert.equal(changed.status, 400);
      assert.equal(changed.body.error.code, 'INVOICE_NOT_COVERED_REASON_REQUIRED');
      // Refused means unchanged.
      const after = await request(app).get(`/api/v1/invoices/${uid}`).set(admin);
      assert.equal(after.body.data.notCovered, false);

      // The reason already stored counts as given: the mark may be set on its
      // own afterwards.
      const withReason = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ notCovered: true, notCoveredReason: 'Nicht im Tarif' });
      assert.equal(withReason.status, 200);
      const again = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ notCovered: true });
      assert.equal(again.status, 200);
      assert.equal(again.body.data.notCoveredReason, 'Nicht im Tarif');
    });

    await t.test('a marked invoice is refused by the submission', async () => {
      const uid = await makeInvoice(accountA, 120, 'R-NC-4');
      await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ notCovered: true, notCoveredReason: 'Zahnersatz ausgeschlossen' });

      const submitted = await post('/api/v1/submissions', {
        contractUID: contractA,
        submittedDate: '2024-09-10',
        invoiceUIDs: [uid],
      });
      assert.equal(submitted.status, 409);
      assert.equal(submitted.body.error.code, 'INVOICES_NOT_COVERED');
      assert.deepEqual(submitted.body.error.details, { invoices: ['R-NC-4'] });
    });

    await t.test('an invoice already submitted cannot be marked', async () => {
      const res = await request(app)
        .patch(`/api/v1/invoices/${inv1}`)
        .set(admin)
        .send({ notCovered: true, notCoveredReason: 'zu spät erkannt' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'INVOICE_NOT_COVERED_SUBMITTED');
      const after = await request(app).get(`/api/v1/invoices/${inv1}`).set(admin);
      assert.equal(after.body.data.notCovered, false);
    });

    // Slice 43: a direct payment dates itself (issues.md 0.12.0-3). The bill
    // was settled on the spot, so it is due and paid on its own date.
    await t.test('a direct payment is due and paid on the invoice date', async () => {
      const created = await post('/api/v1/invoices', {
        invoiceNumber: 'R-DP-1',
        invoiceDate: '2024-10-05',
        treatmentDate: '2024-10-01',
        accountUID: accountB,
        invoiceAmount: 60,
        directPayment: true,
        // Contradicted by the flag on purpose: the rule has the last word.
        transferUntilDate: '2024-11-30',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.data.transferUntilDate, '2024-10-05');
      assert.equal(created.body.data.transferDate, '2024-10-05');
      // The flag leaves the API as a boolean, like its two siblings on the same
      // row — it used to be the only one that came back as the raw 0/1.
      assert.equal(created.body.data.directPayment, true);
      assert.equal(created.body.data.notCovered, false);
      assert.equal(created.body.data.reimbursementClosed, false);
      const uid = created.body.data.invoiceUID as string;

      // A corrected invoice date takes both dates with it.
      const moved = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ invoiceDate: '2024-10-07' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.transferUntilDate, '2024-10-07');
      assert.equal(moved.body.data.transferDate, '2024-10-07');

      // Dropping the flag frees both dates again, empty: "paid on the invoice
      // date" must not stay behind as a statement nobody made.
      const freed = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ directPayment: false });
      assert.equal(freed.status, 200);
      assert.equal(freed.body.data.directPayment, false);
      assert.equal(freed.body.data.transferUntilDate, null);
      assert.equal(freed.body.data.transferDate, null);
    });

    await t.test('dates sent while direct payment is dropped are kept', async () => {
      const uid = (
        await post('/api/v1/invoices', {
          invoiceNumber: 'R-DP-2',
          invoiceDate: '2024-10-08',
          treatmentDate: '2024-10-08',
          accountUID: accountB,
          invoiceAmount: 40,
          directPayment: true,
        })
      ).body.data.invoiceUID as string;

      const corrected = await request(app).patch(`/api/v1/invoices/${uid}`).set(admin).send({
        directPayment: false,
        transferUntilDate: '2024-11-08',
        transferDate: '2024-10-30',
      });
      assert.equal(corrected.status, 200);
      assert.equal(corrected.body.data.transferUntilDate, '2024-11-08');
      assert.equal(corrected.body.data.transferDate, '2024-10-30');

      // An ordinary invoice keeps its dates when something else changes.
      const renamed = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ invoiceNumber: 'R-DP-2b', invoiceDate: '2024-10-09' });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.data.transferUntilDate, '2024-11-08');
      assert.equal(renamed.body.data.transferDate, '2024-10-30');
    });

    // Slice 44: an agency holds several accounts, so the invoice names the one
    // it goes to (issues.md 0.12.0-4).
    await t.test('an invoice names the bank account of its agency', async () => {
      const agency = await post('/api/v1/agencies', {
        agencyName: 'Inkasso Konten',
        bankAccount: 'DE02120300000000202051',
      });
      const agencyUID = agency.body.data.agencyUID as string;
      const firstUID = agency.body.data.accounts[0].agencyAccountUID as string;
      const secondUID = (
        await post(`/api/v1/agencies/${agencyUID}/accounts`, {
          bankAccount: 'DE89370400440532013000',
        })
      ).body.data.agencyAccountUID as string;

      const otherAgency = await post('/api/v1/agencies', {
        agencyName: 'Inkasso Fremd',
        bankAccount: 'DE02500105170137075030',
      });
      const foreignUID = otherAgency.body.data.accounts[0].agencyAccountUID as string;

      const created = await post('/api/v1/invoices', {
        invoiceNumber: 'R-AA-1',
        invoiceDate: '2024-11-05',
        treatmentDate: '2024-11-01',
        accountUID: accountB,
        invoiceAmount: 120,
        agencyUID,
        agencyAccountUID: secondUID,
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.data.agencyAccountUID, secondUID);
      const uid = created.body.data.invoiceUID as string;

      // An account of another agency is refused, on create and on update.
      const foreignOnCreate = await post('/api/v1/invoices', {
        invoiceNumber: 'R-AA-2',
        invoiceDate: '2024-11-05',
        treatmentDate: '2024-11-01',
        accountUID: accountB,
        invoiceAmount: 10,
        agencyUID,
        agencyAccountUID: foreignUID,
      });
      assert.equal(foreignOnCreate.status, 409);
      assert.equal(foreignOnCreate.body.error.code, 'INVOICE_ACCOUNT_NOT_OF_AGENCY');
      const foreignOnUpdate = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ agencyAccountUID: foreignUID });
      assert.equal(foreignOnUpdate.status, 409);

      // Changing something else leaves the account alone.
      const touched = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ transferSubject: 'Rechnung AA-1' });
      assert.equal(touched.body.data.agencyAccountUID, secondUID);

      // Moving to another agency without naming an account clears it — the old
      // one belongs to the old agency.
      const moved = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ agencyUID: otherAgency.body.data.agencyUID });
      assert.equal(moved.body.data.agencyAccountUID, null);

      // Back, with an account of its own; dropping the agency drops it too.
      const back = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ agencyUID, agencyAccountUID: firstUID });
      assert.equal(back.body.data.agencyAccountUID, firstUID);
      const withoutAgency = await request(app)
        .patch(`/api/v1/invoices/${uid}`)
        .set(admin)
        .send({ agencyUID: null });
      assert.equal(withoutAgency.body.data.agencyAccountUID, null);

      // A direct payment has nothing to transfer, so it keeps no account.
      const cash = await post('/api/v1/invoices', {
        invoiceNumber: 'R-AA-3',
        invoiceDate: '2024-11-06',
        treatmentDate: '2024-11-02',
        accountUID: accountB,
        invoiceAmount: 30,
        agencyUID,
        agencyAccountUID: firstUID,
        directPayment: true,
      });
      assert.equal(cash.status, 201);
      assert.equal(cash.body.data.agencyAccountUID, null);
    });
    // Slice 45: which invoices use this agency, this bank account of it, this
    // provider — and what of that is still running (issues.md 0.12.0-5).
    await t.test('invoices are found by agency, bank account, provider and status', async () => {
      const agency = await post('/api/v1/agencies', {
        agencyName: 'Inkasso Filter',
        bankAccount: 'DE12500105170648489890',
      });
      const agencyUID = agency.body.data.agencyUID as string;
      const firstUID = agency.body.data.accounts[0].agencyAccountUID as string;
      const secondUID = (
        await post(`/api/v1/agencies/${agencyUID}/accounts`, {
          bankAccount: 'DE44500105175407324931',
        })
      ).body.data.agencyAccountUID as string;
      const facilityUID = (await post('/api/v1/facilities', { facilityName: 'Praxis Filter' })).body
        .data.facilityUID as string;

      const makeFiltered = async (
        number: string,
        body: Record<string, unknown>,
      ): Promise<string> => {
        const res = await post('/api/v1/invoices', {
          invoiceNumber: number,
          invoiceDate: '2024-12-01',
          treatmentDate: '2024-12-01',
          accountUID: accountA,
          invoiceAmount: 40,
          ...body,
        });
        assert.equal(res.status, 201);
        return res.body.data.invoiceUID as string;
      };

      const onFirst = await makeFiltered('R-F-1', {
        facilityUID,
        agencyUID,
        agencyAccountUID: firstUID,
      });
      const onSecond = await makeFiltered('R-F-2', { agencyUID, agencyAccountUID: secondUID });
      // A third one carries neither, so every filter has something to leave out.
      await makeFiltered('R-F-3', {});

      const uids = async (query: string): Promise<string[]> => {
        const res = await request(app).get(`/api/v1/invoices?${query}`).set(admin);
        assert.equal(res.status, 200);
        return (res.body.data as Array<{ invoiceUID: string }>).map((i) => i.invoiceUID).sort();
      };

      assert.deepEqual(await uids(`agencyUID=${agencyUID}`), [onFirst, onSecond].sort());
      assert.deepEqual(await uids(`agencyAccountUID=${secondUID}`), [onSecond]);
      assert.deepEqual(await uids(`facilityUID=${facilityUID}`), [onFirst]);
      // The filters narrow each other, and the number search narrows them too.
      assert.deepEqual(await uids(`agencyUID=${agencyUID}&facilityUID=${facilityUID}`), [onFirst]);
      assert.deepEqual(await uids(`agencyUID=${agencyUID}&q=R-F-2`), [onSecond]);

      // The status is derived, so the filter has to work on the presented rows:
      // the second invoice is handed in, closed by hand and paid — erledigt.
      const submitted = await post('/api/v1/submissions', {
        contractUID: contractA,
        submittedDate: '2024-12-10',
        invoiceUIDs: [onSecond],
      });
      assert.equal(submitted.status, 201);
      const closed = await request(app)
        .patch(`/api/v1/invoices/${onSecond}`)
        .set(admin)
        .send({ reimbursementClosed: true, transferDate: '2024-12-15' });
      assert.equal(closed.body.data.workflowStatus, 'erledigt');

      assert.deepEqual(await uids(`agencyUID=${agencyUID}&status=offen`), [onFirst]);
      assert.deepEqual(await uids(`agencyUID=${agencyUID}&status=nicht-erledigt`), [onFirst]);
      assert.deepEqual(await uids(`agencyUID=${agencyUID}&status=erledigt`), [onSecond]);
      // The limit counts what the status filter left over, not what it read.
      assert.equal((await uids(`status=nicht-erledigt&limit=1`)).length, 1);

      // The filtered list stays inside what the user may see.
      const scoped = await scopedNutzer(pool, app, 'agency-filter@example.com', accountB);
      const denied = await request(app).get(`/api/v1/invoices?agencyUID=${agencyUID}`).set(scoped);
      assert.equal(denied.status, 200);
      assert.deepEqual(denied.body.data, []);

      // An id that is none is named, not quietly ignored.
      const bad = await request(app)
        .get('/api/v1/invoices?agencyUID=kein-dienstleister')
        .set(admin);
      assert.equal(bad.status, 400);
    });
    // CR-11: the two query readers that used to work by hand. A filter id that
    // is none is named instead of quietly ignored, the list takes the same
    // optional `limit` as its neighbours, and the plan year is a schema.
    await t.test('list filters and the plan year are checked by schema', async () => {
      const badFilter = await request(app).get('/api/v1/allocations?invoiceUID=quatsch').set(admin);
      assert.equal(badFilter.status, 400);
      assert.match(badFilter.body.error.message, /invoiceUID/);

      const all = await request(app).get('/api/v1/allocations').set(admin);
      assert.equal(all.status, 200);
      assert.ok(all.body.data.length > 1);
      const capped = await request(app).get('/api/v1/allocations?limit=1').set(admin);
      assert.deepEqual(capped.body.data, all.body.data.slice(0, 1));

      const badYear = await plan(accountA, 'year=abc');
      assert.equal(badYear.status, 400);
      assert.match(badYear.body.error.message, /year/);
    });
  } finally {
    await pool.end();
  }
});
