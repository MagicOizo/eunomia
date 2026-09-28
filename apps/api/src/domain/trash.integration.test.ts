import assert from 'node:assert/strict';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { germanMoney } from '../lib/german.js';
import { hashPassword } from '../lib/password.js';

/**
 * The Papierkorb (Slice 39): what a deleted record looks like in it, what it
 * takes to bring it back, and what stops it from going for good. The three
 * rules the author set are checked as their own cases — a restore is one
 * transaction, it never breaks a rule the masks enforce, and every failure
 * names the record it hung on. Skips when no DB is configured; CI provides one.
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

const SETUP_TOKEN = 'trash-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'trash-secret',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      setupToken: SETUP_TOKEN,
    },
    trustProxy: 1,
    rateLimit: { authMax: 100000, authWindowMs: 60000, globalMax: 100000, globalWindowMs: 60000 },
    updateCheck: {
      enabled: false,
      repository: 'MagicOizo/eunomia',
      token: undefined,
      cacheTtlMs: 0,
    },
    configEncryptionKey: null,
  };
}

async function resetData(pool: Pool): Promise<void> {
  for (const stmt of [
    'DELETE FROM Allocations',
    'DELETE FROM ServiceBillings',
    'DELETE FROM SubmissionInvoices',
    'DELETE FROM InvoiceExclusions',
    'DELETE FROM InvoiceReminders',
    'DELETE FROM InvoiceTreatmentDays',
    'DELETE FROM Invoices',
    'DELETE FROM Submissions',
    'DELETE FROM ContractPremiums',
    'DELETE FROM ContractBonusTiers',
    'DELETE FROM ContractYears',
    'DELETE FROM ContractTerms',
    'DELETE FROM Contracts',
    'DELETE FROM AgencyBankAccounts',
    'DELETE FROM CollectionAgencies',
    'DELETE FROM InsuranceCompanies',
    'DELETE FROM Facilities',
    'DELETE FROM RefreshTokens',
    'DELETE FROM UserAccountRoles',
    'DELETE FROM UserRoles',
    'DELETE FROM Users',
    'DELETE FROM Accounts',
  ]) {
    await pool.query(stmt);
  }
}

interface TrashEntryDto {
  uid: string;
  label: string;
  context: string;
  deletedAt: string | null;
  restorable: boolean;
  restoreNote: string | null;
  attached: Array<{ singular: string; plural: string; label: string }>;
  attachedRows: Array<{ label: string; count: number }>;
  restoresWith: number;
}

interface TrashGroupDto {
  key: string;
  singular: string;
  plural: string;
  entries: TrashEntryDto[];
}

test('trash: list, restore and delete for good', async (t) => {
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
    const del = (path: string, headers: Record<string, string> = admin) =>
      request(app).delete(path).set(headers);

    const trash = async (): Promise<TrashGroupDto[]> => {
      const res = await request(app).get('/api/v1/trash').set(admin);
      assert.equal(res.status, 200);
      return res.body.data.groups as TrashGroupDto[];
    };
    const group = async (key: string): Promise<TrashGroupDto | undefined> =>
      (await trash()).find((one) => one.key === key);
    const entry = async (key: string, label: string): Promise<TrashEntryDto | undefined> =>
      (await group(key))?.entries.find((one) => one.label === label);

    // Master data and one full workflow to delete pieces out of.
    const accountUID = (
      await post('/api/v1/accounts', {
        firstname: 'Anna',
        surname: 'Muster',
        birthDate: '1985-04-12',
      })
    ).body.data.accountUID as string;
    const companyUID = (await post('/api/v1/companies', { companyName: 'Kranken AG' })).body.data
      .companyUID as string;
    const contractUID = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-1',
        companyUID,
        accountUID,
        contractBegin: '2020-01-01',
        initialDeductible: 0,
      })
    ).body.data.contractUID as string;
    const facilityUID = (await post('/api/v1/facilities', { facilityName: 'Dr. Weg' })).body.data
      .facilityUID as string;
    const spareFacility = (await post('/api/v1/facilities', { facilityName: 'Apotheke Nord' })).body
      .data.facilityUID as string;

    const makeInvoice = async (
      number: string,
      amount: number,
      facility?: string,
    ): Promise<string> =>
      (
        await post('/api/v1/invoices', {
          invoiceNumber: number,
          invoiceDate: '2024-05-01',
          treatmentDate: '2024-05-01',
          accountUID,
          invoiceAmount: amount,
          ...(facility === undefined ? {} : { facilityUID: facility }),
        })
      ).body.data.invoiceUID as string;

    await t.test('an empty trash has no groups', async () => {
      assert.deepEqual(await trash(), []);
    });

    await t.test('a deleted record shows up with its name, context and moment', async () => {
      await del(`/api/v1/facilities/${spareFacility}`);
      const found = await entry('facility', 'Apotheke Nord');
      assert.ok(found, 'the deleted facility is in the trash');
      assert.equal(found.restorable, true);
      assert.equal(found.restoreNote, null);
      assert.match(String(found.deletedAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      const groups = await trash();
      assert.deepEqual(
        groups.map((one) => one.key),
        ['facility'],
        'only the group that has something in it',
      );
    });

    await t.test('restoring puts it back into its own list', async () => {
      const res = await post(`/api/v1/trash/${spareFacility}/restore`, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.data.restored, 1);
      const list = await request(app).get('/api/v1/facilities').set(admin);
      assert.ok(
        (list.body.data as Array<{ facilityUID: string }>).some(
          (row) => row.facilityUID === spareFacility,
        ),
      );
      assert.deepEqual(await trash(), []);
    });

    await t.test('an invoice names the insured person and its amount', async () => {
      const invoiceUID = await makeInvoice('R-TRASH', 120, facilityUID);
      await del(`/api/v1/invoices/${invoiceUID}`);
      const found = await entry('invoice', 'R-TRASH');
      assert.ok(found);
      assert.equal(found.context, `Anna Muster, ${germanMoney(120)}, 01.05.2024`);
      await post(`/api/v1/trash/${invoiceUID}/restore`, {});
    });

    await t.test('a restore is refused while a required ancestor is in the trash', async () => {
      const premium = (
        await post(`/api/v1/contracts/${contractUID}/premiums`, {
          validFrom: '2021-01-01',
          monthlyPremium: 400,
        })
      ).body.data.premiumUID as string;
      await del(`/api/v1/contracts/${contractUID}/premiums/${premium}`);
      await del(`/api/v1/contracts/${contractUID}`);

      const res = await post(`/api/v1/trash/${premium}/restore`, {});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'PARENT_IN_TRASH');
      assert.equal(res.body.error.details.parent.singular, 'Police');
      assert.equal(res.body.error.details.parent.label, 'PKV-1');
      assert.equal(res.body.error.details.entry.singular, 'Beitragsstand');

      // Nothing moved: the premium is still deleted.
      const still = await entry('premium', 'ab 01.01.2021');
      assert.ok(still, 'the premium stayed in the trash');

      // With the policy back, the premium comes back too.
      await post(`/api/v1/trash/${contractUID}/restore`, {});
      const second = await post(`/api/v1/trash/${premium}/restore`, {});
      assert.equal(second.status, 200);
    });

    await t.test('a restore that would break a rule of the mask is refused', async () => {
      const contract = await request(app).get(`/api/v1/contracts/${contractUID}`).set(admin);
      const existing = (
        contract.body.data.premiums as Array<{ premiumUID: string; validFrom: string }>
      ).find((row) => row.validFrom === '2021-01-01');
      assert.ok(existing);
      await del(`/api/v1/contracts/${contractUID}/premiums/${existing.premiumUID}`);
      // The same start date is taken again while the old entry is in the trash.
      await post(`/api/v1/contracts/${contractUID}/premiums`, {
        validFrom: '2021-01-01',
        monthlyPremium: 450,
      });

      const res = await post(`/api/v1/trash/${existing.premiumUID}/restore`, {});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'HISTORY_START_EXISTS');
      assert.equal(res.body.error.details.entry.singular, 'Beitragsstand');
      assert.equal(res.body.error.details.entry.label, 'ab 01.01.2021');
      assert.ok(await entry('premium', 'ab 01.01.2021'), 'it stayed in the trash');
    });

    let billingUID = '';
    let billedInvoice = '';
    await t.test('a deleted billing lists the reimbursements that go with it', async () => {
      billedInvoice = await makeInvoice('R-BILLED', 200);
      await post('/api/v1/submissions', {
        contractUID,
        submittedDate: '2024-06-01',
        invoiceUIDs: [billedInvoice],
      });
      billingUID = (
        await post('/api/v1/billings', {
          contractUID,
          billingDate: '2024-07-01',
          billingNumber: 'LA-1',
        })
      ).body.data.billingUID as string;
      await post(`/api/v1/billings/${billingUID}/allocations`, {
        entries: [{ invoiceUID: billedInvoice, reimbursement: 50 }],
      });

      await del(`/api/v1/billings/${billingUID}`);
      const found = await entry('serviceBilling', 'LA-1');
      assert.ok(found);
      assert.deepEqual(found.attached, [
        { singular: 'Erstattung', plural: 'Erstattungen', label: germanMoney(50) },
      ]);
      assert.equal(found.restoresWith, 1, 'the reimbursement was deleted in the same batch');
    });

    await t.test('restoring the billing brings its reimbursements back', async () => {
      const res = await post(`/api/v1/trash/${billingUID}/restore`, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.data.restored, 2);
      const invoice = await request(app).get(`/api/v1/invoices/${billedInvoice}`).set(admin);
      assert.equal(invoice.body.data.workflowStatus, 'teilabgerechnet');
      assert.equal(Number(invoice.body.data.reimbursedTotal), 50);
      assert.equal(await entry('serviceBilling', 'LA-1'), undefined);
    });

    await t.test('a failing child rolls the whole batch back', async () => {
      // Delete the billing (and with it the 50 € reimbursement), then reimburse
      // the invoice fully from a second letter: the old 50 € no longer fit.
      await del(`/api/v1/billings/${billingUID}`);
      const second = (
        await post('/api/v1/billings', {
          contractUID,
          billingDate: '2024-08-01',
          billingNumber: 'LA-2',
        })
      ).body.data.billingUID as string;
      await post(`/api/v1/billings/${second}/allocations`, {
        entries: [{ invoiceUID: billedInvoice, reimbursement: 200 }],
      });

      const res = await post(`/api/v1/trash/${billingUID}/restore`, {});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'REIMBURSEMENT_EXCEEDS_INVOICE');
      assert.equal(res.body.error.details.entry.singular, 'Erstattung');
      assert.equal(res.body.error.details.entry.label, germanMoney(50));

      // All or nothing: the billing itself is still deleted as well.
      const rows = await pool.query<Array<{ billingStatus: number }>>(
        'SELECT billingStatus FROM ServiceBillings WHERE billingUID = ?',
        [billingUID],
      );
      assert.equal(rows[0]?.billingStatus, -1, 'the billing did not come back either');
      assert.ok(await entry('serviceBilling', 'LA-1'));
    });

    await t.test('a billing number taken in the meantime blocks the restore', async () => {
      const third = (
        await post('/api/v1/billings', {
          contractUID,
          billingDate: '2024-09-01',
          billingNumber: 'LA-3',
        })
      ).body.data.billingUID as string;
      await del(`/api/v1/billings/${third}`);
      await post('/api/v1/billings', {
        contractUID,
        billingDate: '2024-09-02',
        billingNumber: 'LA-3',
      });

      const res = await post(`/api/v1/trash/${third}/restore`, {});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'BILLING_NUMBER_TAKEN');
      assert.equal(res.body.error.details.entry.label, 'LA-3');
    });

    // Slice 44: bank accounts stand side by side, so a returning one breaks no
    // rule — but an invoice that named one holds it fast.
    await t.test('a bank account comes back freely and leaves only unused', async () => {
      const agency = await post('/api/v1/agencies', {
        agencyName: 'Inkasso Papierkorb',
        bankAccount: 'DE02120300000000202051',
      });
      const agencyUID = agency.body.data.agencyUID as string;
      const firstUID = agency.body.data.accounts[0].agencyAccountUID as string;
      const secondUID = (
        await post(`/api/v1/agencies/${agencyUID}/accounts`, {
          bankAccount: 'DE89370400440532013000',
          note: 'zweites Konto',
        })
      ).body.data.agencyAccountUID as string;

      // The unused one goes and comes back, although an account without a date
      // now stands beside another one — which the old rule forbade.
      assert.equal((await del(`/api/v1/agencies/${agencyUID}/accounts/${secondUID}`)).status, 204);
      const deleted = await entry('agencyAccount', 'DE89370400440532013000');
      assert.ok(deleted, 'it is in the trash');
      assert.match(deleted.context, /Inkasso Papierkorb/);
      assert.equal((await post(`/api/v1/trash/${secondUID}/restore`, {})).status, 200);
      assert.equal(
        (await request(app).get(`/api/v1/agencies/${agencyUID}`).set(admin)).body.data.accounts
          .length,
        2,
      );

      // The one an invoice names cannot be removed for good.
      const invoiceUID = await makeInvoice('R-KONTO', 50);
      await request(app)
        .patch(`/api/v1/invoices/${invoiceUID}`)
        .set(admin)
        .send({ agencyUID, agencyAccountUID: firstUID });
      assert.equal((await del(`/api/v1/agencies/${agencyUID}/accounts/${firstUID}`)).status, 204);
      const res = await del(`/api/v1/trash/${firstUID}`);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'STILL_REFERENCED');
      assert.deepEqual(res.body.error.details.blockers, [{ label: 'Rechnung', count: 1 }]);
      assert.equal((await post(`/api/v1/trash/${firstUID}/restore`, {})).status, 200);
    });

    await t.test('an active reference stops the record from going for good', async () => {
      await del(`/api/v1/facilities/${facilityUID}`);
      const res = await del(`/api/v1/trash/${facilityUID}`);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'STILL_REFERENCED');
      assert.deepEqual(res.body.error.details.blockers, [{ label: 'Rechnung', count: 1 }]);
      assert.ok(await entry('facility', 'Dr. Weg'), 'it stayed in the trash');
    });

    await t.test('deleting for good takes the deleted records below it along', async () => {
      const found = await entry('serviceBilling', 'LA-1');
      assert.ok(found);
      assert.equal(found.attached.length, 1, 'the reimbursement hangs on it');

      const res = await del(`/api/v1/trash/${billingUID}`);
      assert.equal(res.status, 204);
      const billings = await pool.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM ServiceBillings WHERE billingUID = ?',
        [billingUID],
      );
      assert.equal(Number(billings[0]?.n), 0, 'the billing row is gone');
      const allocations = await pool.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM Allocations WHERE billingUID = ?',
        [billingUID],
      );
      assert.equal(Number(allocations[0]?.n), 0, 'its reimbursement went with it');
    });

    await t.test('an emptied submission is shown but cannot be restored', async () => {
      const invoiceUID = await makeInvoice('R-ONLY', 30);
      const submissionUID = (
        await post('/api/v1/submissions', {
          contractUID,
          submittedDate: '2024-10-01',
          invoiceUIDs: [invoiceUID],
        })
      ).body.data.submissionUID as string;
      await del(`/api/v1/submissions/${submissionUID}/invoices/${invoiceUID}`);

      const found = await entry('submission', 'vom 01.10.2024');
      assert.ok(found);
      assert.equal(found.restorable, false);
      assert.match(String(found.restoreNote), /kann nicht wiederhergestellt werden/);

      const restore = await post(`/api/v1/trash/${submissionUID}/restore`, {});
      assert.equal(restore.status, 409);
      assert.equal(restore.body.error.code, 'NOT_RESTORABLE');

      const purge = await del(`/api/v1/trash/${submissionUID}`);
      assert.equal(purge.status, 204);
      assert.equal(await entry('submission', 'vom 01.10.2024'), undefined);
    });

    await t.test('purging an invoice takes its submission links along', async () => {
      const invoiceUID = await makeInvoice('R-PURGE', 40);
      // Two treatment days, so the purge has something of Slice 41a to take
      // along. They are registered nowhere: `purgeEntry` reads the foreign
      // keys out of information_schema and clears the RESTRICT links that are
      // not records of their own — proven here rather than assumed.
      await request(app)
        .patch(`/api/v1/invoices/${invoiceUID}`)
        .set(admin)
        .send({ treatmentDates: ['2024-05-01', '2024-05-08'] });
      const dayCount = async (): Promise<number> =>
        Number(
          (
            await pool.query<Array<{ n: number }>>(
              'SELECT COUNT(*) AS n FROM InvoiceTreatmentDays WHERE invoiceUID = ?',
              [invoiceUID],
            )
          )[0]?.n,
        );
      assert.equal(await dayCount(), 2);
      const submissionUID = (
        await post('/api/v1/submissions', {
          contractUID,
          submittedDate: '2024-11-01',
          invoiceUIDs: [invoiceUID],
        })
      ).body.data.submissionUID as string;
      await del(`/api/v1/invoices/${invoiceUID}`);

      const found = await entry('invoice', 'R-PURGE');
      assert.ok(found);
      assert.deepEqual(found.attachedRows, [{ label: 'Rechnung in einer Einreichung', count: 1 }]);

      const res = await del(`/api/v1/trash/${invoiceUID}`);
      assert.equal(res.status, 204);
      const links = await pool.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM SubmissionInvoices WHERE invoiceUID = ?',
        [invoiceUID],
      );
      assert.equal(Number(links[0]?.n), 0, 'the link is gone');
      assert.equal(await dayCount(), 0, 'the treatment days went with it');
      // The submission it emptied followed its invoice into the trash.
      const submission = await pool.query<Array<{ submissionStatus: number }>>(
        'SELECT submissionStatus FROM Submissions WHERE submissionUID = ?',
        [submissionUID],
      );
      assert.equal(submission[0]?.submissionStatus, -1);
    });

    await t.test('a live record is not reachable through the trash', async () => {
      const restore = await post(`/api/v1/trash/${accountUID}/restore`, {});
      assert.equal(restore.status, 404);
      const purge = await del(`/api/v1/trash/${accountUID}`);
      assert.equal(purge.status, 404);
      const unknown = await del('/api/v1/trash/zzzzzzzzzzzz');
      assert.equal(unknown.status, 404);
    });

    await t.test('without MANAGE_TRASH the whole area is closed', async () => {
      const password = 'nutzerpass1';
      const insert = (await pool.query(
        'INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)',
        ['nutzer@example.com', 'Nils', await hashPassword(password)],
      )) as { insertId: number };
      const nutzer = (
        await pool.query<Array<{ roleID: number }>>(
          "SELECT roleID FROM Roles WHERE roleName = 'Nutzer'",
        )
      )[0];
      await pool.query(
        'INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)',
        [insert.insertId, nutzer?.roleID, accountUID],
      );
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nutzer@example.com', password });
      const headers = { Authorization: `Bearer ${login.body.accessToken}` };

      assert.equal((await request(app).get('/api/v1/trash').set(headers)).status, 403);
      assert.equal((await del(`/api/v1/trash/${facilityUID}`, headers)).status, 403);
      assert.equal((await post(`/api/v1/trash/${facilityUID}/restore`, {}, headers)).status, 403);
    });
  } finally {
    await pool.end();
  }
});
