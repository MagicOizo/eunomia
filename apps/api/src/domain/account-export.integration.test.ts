import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS } from '@eunomia/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { generateEntityId } from '../lib/ids.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';

/**
 * The account export (SEC-15, Art. 15/20 DSGVO): everything stored about one
 * insured person, in one document.
 *
 * The suite is built around an inventory, in the spirit of Scheibe 16: every
 * table of the schema is either in the export — and then with the place it
 * appears in and a way to read it back — or it carries a line saying why it is
 * not. The list is held against `information_schema`, so a new table with a
 * link to a person fails this suite until someone decides where it belongs.
 *
 * The second half is what makes the first half honest: the walk-through fills
 * every branch and then demands that each exported table really did arrive in
 * the document. A list that only claims coverage is a list that drifts.
 */

type Doc = Record<string, unknown>;
const list = (value: unknown): Doc[] => (Array.isArray(value) ? (value as Doc[]) : []);

/** In the export: where it sits, and how to read its rows out of the document. */
interface Exported {
  kind: 'exported';
  where: string;
  rows: (doc: Doc) => Doc[];
}
/** Not in the export, with the reason. */
interface Excluded {
  kind: 'excluded';
  why: string;
}

const exported = (where: string, rows: (doc: Doc) => Doc[]): Exported => ({
  kind: 'exported',
  where,
  rows,
});
const excluded = (why: string): Excluded => ({ kind: 'excluded', why });

const contracts = (doc: Doc): Doc[] => list(doc.contracts);
const terms = (doc: Doc): Doc[] => contracts(doc).flatMap((row) => list(row.terms));
const submissions = (doc: Doc): Doc[] => contracts(doc).flatMap((row) => list(row.submissions));
const billings = (doc: Doc): Doc[] => contracts(doc).flatMap((row) => list(row.billings));
const invoices = (doc: Doc): Doc[] => list(doc.invoices);

/**
 * Every table of the schema, and what the export does with it. Read it as the
 * answer to "what does the instance know about a person, and where does it go".
 */
const INVENTORY: Record<string, Exported | Excluded> = {
  // The person, and everything that hangs on them.
  Accounts: exported('account', (doc) => [doc.account as Doc]),
  Contracts: exported('contracts[]', contracts),
  ContractPremiums: exported('contracts[].premiums[]', (doc) =>
    contracts(doc).flatMap((row) => list(row.premiums)),
  ),
  ContractTerms: exported('contracts[].terms[]', terms),
  ContractBonusTiers: exported('contracts[].terms[].bonusTiers[]', (doc) =>
    terms(doc).flatMap((row) => list(row.bonusTiers)),
  ),
  ContractYears: exported('contracts[].years[]', (doc) =>
    contracts(doc).flatMap((row) => list(row.years)),
  ),
  Submissions: exported('contracts[].submissions[]', submissions),
  SubmissionInvoices: exported('contracts[].submissions[].invoices[]', (doc) =>
    submissions(doc).flatMap((row) => list(row.invoices)),
  ),
  ServiceBillings: exported('contracts[].billings[]', billings),
  Allocations: exported('contracts[].billings[].allocations[]', (doc) =>
    billings(doc).flatMap((row) => list(row.allocations)),
  ),
  Invoices: exported('invoices[]', invoices),
  InvoiceTreatmentDays: exported('invoices[].treatmentDays[]', (doc) =>
    invoices(doc).flatMap((row) => list(row.treatmentDays)),
  ),
  InvoiceExclusions: exported('invoices[].exclusions[]', (doc) =>
    invoices(doc).flatMap((row) => list(row.exclusions)),
  ),
  InvoiceReminders: exported('invoices[].reminders[]', (doc) =>
    invoices(doc).flatMap((row) => list(row.reminders)),
  ),

  // Not about the person. Each line is a decision, not an omission.
  InsuranceCompanies: excluded('global master data; referenced by UID from the policies'),
  Facilities: excluded('global master data; referenced by UID from the invoices'),
  CollectionAgencies: excluded('global master data; referenced by UID from the invoices'),
  AgencyBankAccounts: excluded("a collection agency's own bank details, not the person's"),
  Users: excluded('the logins of the instance — other people'),
  Roles: excluded('the role catalogue of the instance'),
  Permissions: excluded('the permission catalogue of the instance'),
  RolePermissions: excluded('which role holds which permission'),
  UserRoles: excluded('who may do what instance-wide — about users'),
  UserAccountRoles: excluded('who may see this person — about users, not about them'),
  RefreshTokens: excluded('sessions of users'),
  SystemSettings: excluded('the configuration of the instance'),
  schema_migrations: excluded('which migrations have run'),
};

test('account export: the inventory of what is stored about one person', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });
    const { admin, uuid: adminUuid } = await bootstrapAdmin(app);

    const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
    const put = (path: string, body: object) => request(app).put(path).set(admin).send(body);

    await t.test('every table of the schema is either in the export or excused', async () => {
      const rows = await pool.query<Array<{ name: string }>>(
        `SELECT TABLE_NAME AS name FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
      );
      const inSchema = rows.map((row) => row.name).sort();
      assert.deepEqual(
        inSchema,
        Object.keys(INVENTORY).sort(),
        'a table of the schema is missing from the inventory above (or the inventory names one that is gone)',
      );
    });

    // One insured person with every branch filled, so the coverage check below
    // has something to find in each of them.
    const accountUID = (
      await post('/api/v1/accounts', {
        firstname: 'Anna',
        surname: 'Muster',
        birthDate: '1985-04-12',
      })
    ).body.data.accountUID as string;
    const other = (await post('/api/v1/accounts', { firstname: 'Bea', birthDate: '1990-02-02' }))
      .body.data.accountUID as string;
    const companyUID = (await post('/api/v1/companies', { companyName: 'Kranken AG' })).body.data
      .companyUID as string;
    const facilityUID = (await post('/api/v1/facilities', { facilityName: 'Dr. Weg' })).body.data
      .facilityUID as string;

    const contractUID = (
      await post('/api/v1/contracts', {
        contractNumber: 'PKV-EXPORT',
        companyUID,
        accountUID,
        contractBegin: '2020-01-01',
        initialDeductible: 300,
      })
    ).body.data.contractUID as string;
    const secondary = (
      await post('/api/v1/contracts', {
        contractNumber: 'ZV-EXPORT',
        companyUID,
        accountUID,
        contractBegin: '2020-01-01',
        initialDeductible: 0,
        contractKind: 'SUPPLEMENTARY',
      })
    ).body.data.contractUID as string;

    await post(`/api/v1/contracts/${contractUID}/premiums`, {
      validFrom: '2021-01-01',
      monthlyPremium: 400,
    });
    await post(`/api/v1/contracts/${contractUID}/terms`, {
      validFromYear: 2021,
      deductible: 200,
      bonusTiers: [{ claimFreeYears: 1, bonusAmount: 250 }],
    });
    await put(`/api/v1/contracts/${contractUID}/years/2022`, { note: 'Schreiben der Kasse' });

    const invoiceUID = (
      await post('/api/v1/invoices', {
        invoiceNumber: 'R-EXPORT',
        invoiceDate: '2024-05-01',
        treatmentDate: '2024-05-01',
        treatmentDates: ['2024-05-01', '2024-05-02'],
        accountUID,
        facilityUID,
        invoiceAmount: 500,
      })
    ).body.data.invoiceUID as string;
    await post(`/api/v1/invoices/${invoiceUID}/exclusions`, {
      contractUID: secondary,
      note: 'Stationär',
    });
    await post('/api/v1/submissions', {
      contractUID,
      submittedDate: '2024-06-01',
      invoiceUIDs: [invoiceUID],
    });
    const billingUID = (
      await post('/api/v1/billings', {
        contractUID,
        billingDate: '2024-07-01',
        billingNumber: 'LA-EXPORT',
      })
    ).body.data.billingUID as string;
    await post(`/api/v1/billings/${billingUID}/allocations`, {
      entries: [{ invoiceUID, reimbursement: 200 }],
    });
    // A reminder is written by the daily run, which needs a mail server; the row
    // is what matters here, so it is written straight into the table.
    await pool.query(
      `INSERT INTO InvoiceReminders (invoiceUID, userID, stage, sentOn)
       SELECT ?, userID, 'due', '2024-07-02' FROM Users WHERE uuidText = ?`,
      [invoiceUID, adminUuid],
    );

    // Something of the other person's, to prove it stays out.
    await post('/api/v1/invoices', {
      invoiceNumber: 'R-OTHER',
      invoiceDate: '2024-05-01',
      treatmentDate: '2024-05-01',
      accountUID: other,
      invoiceAmount: 99,
    });

    const load = async (uid = accountUID): Promise<Doc> => {
      const res = await request(app).get(`/api/v1/accounts/${uid}/export`).set(admin);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body.data as Doc;
    };

    await t.test('every exported table really arrives in the document', async () => {
      const doc = await load();
      for (const [table, entry] of Object.entries(INVENTORY)) {
        if (entry.kind !== 'exported') continue;
        assert.ok(
          entry.rows(doc).length > 0,
          `${table} is claimed at ${entry.where}, but nothing of it is in the document`,
        );
      }
    });

    await t.test('the document holds the stored values, not the rendered ones', async () => {
      const doc = await load();
      const account = doc.account as Doc;
      assert.equal(account.accountUID, accountUID);
      assert.equal(account.firstname, 'Anna');
      assert.equal(String(account.birthDate).slice(0, 10), '1985-04-12');
      assert.match(String(doc.exportedAt), /^\d{4}-\d{2}-\d{2}T/);

      const invoice = invoices(doc)[0];
      assert.equal(invoice?.invoiceNumber, 'R-EXPORT');
      assert.equal(Number(invoice?.invoiceAmount), 500, 'a number, not "500,00 €"');
      assert.equal(invoice?.facilityUID, facilityUID, 'master data stays a reference');
    });

    await t.test('the internal numeric keys stay out, the public ones stay in', async () => {
      const doc = await load();
      const everyRow = [
        doc.account as Doc,
        ...contracts(doc),
        ...invoices(doc),
        ...terms(doc),
        ...billings(doc),
        ...submissions(doc),
      ];
      for (const row of everyRow) {
        for (const key of Object.keys(row)) {
          assert.ok(
            !/ID$/.test(key) || /UID$/.test(key),
            `${key} is an internal key and has no business in an export`,
          );
        }
      }
      assert.ok(Object.keys(doc.account as Doc).includes('accountUID'));
    });

    await t.test('no data about other people travels with it', async () => {
      const doc = await load();
      const reminder = invoices(doc).flatMap((row) => list(row.reminders))[0];
      assert.deepEqual(Object.keys(reminder ?? {}).sort(), ['invoiceUID', 'sentOn', 'stage']);
      const text = JSON.stringify(doc);
      assert.ok(!text.includes('R-OTHER'), "the other person's invoice stays out");
      assert.ok(!text.includes(adminUuid), 'and so does the user who was reminded');
    });

    await t.test('deleted records are part of the account', async () => {
      await request(app).delete(`/api/v1/invoices/${invoiceUID}`).set(admin);
      const doc = await load();
      const invoice = invoices(doc).find((row) => row.invoiceUID === invoiceUID);
      assert.ok(invoice, 'a deleted invoice is still stored and therefore still exported');
      assert.equal(invoice.invoiceStatus, -1);
      // As stored, not as rendered: DATETIME(6) keeps its microseconds, which
      // is more precision than a JS date has, so the driver hands over text.
      assert.match(String(invoice.deletedAt), /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
    });

    await t.test('an unknown insured person is a 404', async () => {
      const res = await request(app).get('/api/v1/accounts/aAAAAAAAAAAA/export').set(admin);
      assert.equal(res.status, 404);
    });

    await t.test('the export needs the permission for this very person', async () => {
      const created = await post('/api/v1/users', {
        email: 'reader@example.com',
        firstname: 'Rea',
        password: 'readerpass1',
      });
      const roles = (await request(app).get('/api/v1/roles').set(admin)).body.data as Array<{
        roleUID: string;
        roleName: string;
      }>;
      const nutzer = roles.find((role) => role.roleName === 'Nutzer');
      assert.ok(nutzer);
      await put(`/api/v1/users/${created.body.data.uuid}/account-roles`, {
        grants: [{ accountUID: other, roleUID: nutzer.roleUID }],
      });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'reader@example.com', password: 'readerpass1' });
      const reader = { Authorization: `Bearer ${login.body.accessToken}` };

      const mine = await request(app).get(`/api/v1/accounts/${other}/export`).set(reader);
      assert.equal(mine.status, 200, 'the person they may read');
      const foreign = await request(app).get(`/api/v1/accounts/${accountUID}/export`).set(reader);
      assert.equal(foreign.status, 403, 'and no other');
    });

    await t.test('reading the record is not enough; the export wants all three', async () => {
      // The decision on B-3 (2026-10-04): the document carries the invoices and
      // the billings, and every other way to those asks for its own permission.
      // No such role exists today — "Nutzer" carries all three and roles cannot
      // be created over the API — so it is composed here, which is exactly the
      // role the finding was about.
      const roleUID = generateEntityId('role');
      await pool.query('INSERT INTO Roles (roleUID, roleName, roleStatus) VALUES (?, ?, 1)', [
        roleUID,
        'Nur Stammdaten lesen',
      ]);
      await pool.query(
        `INSERT INTO RolePermissions (roleID, permissionID)
         SELECT (SELECT roleID FROM Roles WHERE roleUID = ?), permissionID
           FROM Permissions WHERE permissionKey = ?`,
        [roleUID, PERMISSIONS.VIEW_ACCOUNTS],
      );

      const created = await post('/api/v1/users', {
        email: 'recordreader@example.com',
        firstname: 'Rec',
        password: 'recordpass1',
      });
      await put(`/api/v1/users/${created.body.data.uuid}/account-roles`, {
        grants: [{ accountUID: other, roleUID }],
      });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'recordreader@example.com', password: 'recordpass1' });
      const reader = { Authorization: `Bearer ${login.body.accessToken}` };

      const record = await request(app).get(`/api/v1/accounts/${other}`).set(reader);
      assert.equal(record.status, 200, 'the record itself stays readable');
      const exportRes = await request(app).get(`/api/v1/accounts/${other}/export`).set(reader);
      assert.equal(exportRes.status, 403, 'the export is not');
    });
  } finally {
    await pool.end();
  }
});
