import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { hashPassword } from '../lib/password.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

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
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });

    const { admin } = await bootstrapAdmin(app);

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
      // Creating an agency creates its first bank account.
      assert.equal(agency.body.data.bankAccount, 'DE02120300000000202051');
      assert.deepEqual(
        agency.body.data.accounts.map((a: { bankAccount: string }) => a.bankAccount),
        ['DE02120300000000202051'],
      );

      const badBic = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Bad BIC', bankAccount: 'DE02120300000000202051', bic: 'nope' });
      assert.equal(badBic.status, 400);
      assert.equal(badBic.body.error.code, 'VALIDATION_ERROR');
    });

    await t.test('an agency holds several bank accounts side by side', async () => {
      const created = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Inkasso Mehrkonto', bankAccount: 'DE02120300000000202051' });
      assert.equal(created.status, 201);
      const uid = created.body.data.agencyUID as string;
      const firstUID = created.body.data.accounts[0].agencyAccountUID as string;

      const second = await request(app).post(`/api/v1/agencies/${uid}/accounts`).set(admin).send({
        bankAccount: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        recipientName: 'Zahlstelle Mehrkonto',
        note: 'für Rechnungen der Radiologie',
      });
      assert.equal(second.status, 201);
      const third = await request(app)
        .post(`/api/v1/agencies/${uid}/accounts`)
        .set(admin)
        .send({ bankAccount: 'DE02500105170137075030' });
      assert.equal(third.status, 201);

      // All three stand, in the order they were recorded, and the first one is
      // what the agency flattens as its own — nothing is "in force" any more.
      const detail = await request(app).get(`/api/v1/agencies/${uid}`).set(admin);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.bankAccount, 'DE02120300000000202051');
      assert.equal(detail.body.data.recipientName, null);
      assert.deepEqual(
        detail.body.data.accounts.map((a: { bankAccount: string }) => a.bankAccount),
        ['DE02120300000000202051', 'DE89370400440532013000', 'DE02500105170137075030'],
      );

      // Renaming the agency leaves its accounts alone.
      const renamed = await request(app)
        .patch(`/api/v1/agencies/${uid}`)
        .set(admin)
        .send({ agencyName: 'Inkasso Umbenannt' });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.data.agencyName, 'Inkasso Umbenannt');
      assert.equal(renamed.body.data.accounts.length, 3);

      // Correcting an account, then dropping it: the rest keeps its order.
      const moved = await request(app)
        .patch(`/api/v1/agencies/${uid}/accounts/${second.body.data.agencyAccountUID}`)
        .set(admin)
        .send({ note: 'für Rechnungen des Labors' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.note, 'für Rechnungen des Labors');

      const removed = await request(app)
        .delete(`/api/v1/agencies/${uid}/accounts/${second.body.data.agencyAccountUID}`)
        .set(admin);
      assert.equal(removed.status, 204);

      const afterDelete = await request(app).get(`/api/v1/agencies/${uid}`).set(admin);
      assert.equal(afterDelete.body.data.bankAccount, 'DE02120300000000202051');
      assert.equal(afterDelete.body.data.accounts.length, 2);
      assert.equal(afterDelete.body.data.accounts[0].agencyAccountUID, firstUID);

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
