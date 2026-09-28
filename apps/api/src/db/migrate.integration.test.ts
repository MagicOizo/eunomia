import assert from 'node:assert/strict';
import test from 'node:test';

import type { DatabaseConfig } from '../config/env.js';
import { runMigrations } from './migrate.js';
import { createPool, waitForDatabase } from './pool.js';
import { createMigrator } from './umzug.js';

const EXPECTED_TABLES = [
  'Accounts',
  'InsuranceCompanies',
  'Contracts',
  'ContractPremiums',
  'ContractTerms',
  'ContractBonusTiers',
  'ContractYears',
  'Facilities',
  'CollectionAgencies',
  'AgencyBankAccounts',
  'Submissions',
  'SubmissionInvoices',
  'InvoiceExclusions',
  'Invoices',
  'InvoiceTreatmentDays',
  'ServiceBillings',
  'Allocations',
];

/** Reads DB config from the environment, or null when it isn't fully set. */
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

// This test needs a real MariaDB. It runs in CI (which provides one) and is
// skipped locally when no DB env is configured, so `npm test` stays runnable
// without a database.
test('migrations create every table and are idempotent', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }

  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  try {
    await runMigrations(pool);

    const rows = await pool.query<Array<{ name: string }>>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    const tableNames = rows.map((row) => row.name);
    for (const table of EXPECTED_TABLES) {
      assert.ok(tableNames.includes(table), `expected table ${table} to exist`);
    }

    // Running migrations a second time must change nothing (the Slice 2 DoD).
    const migrator = createMigrator(pool);
    const executedBefore = await migrator.executed();
    await migrator.up();
    const executedAfter = await migrator.executed();
    assert.deepEqual(executedAfter, executedBefore);
    assert.ok(executedBefore.length >= 1, 'at least one migration should be recorded');
  } finally {
    await pool.end();
  }
});

test('migration 006 drops contract workflow data but keeps invoices and master data', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name006 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('006-'));
    assert.ok(name006, 'migration 006 should be recorded');

    // Back to the pre-v3 shape, with one old-style contract, submission, billing and allocation.
    await migrator.down({ to: name006 });
    for (const table of [
      'Allocations',
      'ServiceBillings',
      'Invoices',
      'Submissions',
      'Contracts',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query("DELETE FROM InsuranceCompanies WHERE companyUID = 'vMIGRATION06'");
    await pool.query("DELETE FROM Accounts WHERE accountUID = 'aMIGRATION06'");
    await pool.query(
      "INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES ('aMIGRATION06', 'Mig', '1990-01-01')",
    );
    await pool.query(
      "INSERT INTO InsuranceCompanies (companyUID, companyName) VALUES ('vMIGRATION06', 'Mig AG')",
    );
    await pool.query(
      `INSERT INTO Contracts (contractUID, contractNumber, companyUID, accountUID, contractBegin, deductible, monthlyRate, bonus)
       VALUES ('pMIGRATION06', 'OLD-1', 'vMIGRATION06', 'aMIGRATION06', '2020-01-01', 300, 400, 600)`,
    );
    await pool.query(
      "INSERT INTO Submissions (submissionUID, contractUID, submittedDate) VALUES ('eMIGRATION06', 'pMIGRATION06', '2024-03-01')",
    );
    await pool.query(
      `INSERT INTO Invoices (invoiceUID, invoiceNumber, invoiceDate, treatmentDate, accountUID, submissionUID, invoiceAmount)
       VALUES ('iMIGRATION06', 'R-1', '2024-02-01', '2024-02-01', 'aMIGRATION06', 'eMIGRATION06', 100)`,
    );
    await pool.query(
      "INSERT INTO ServiceBillings (billingUID, submissionUID, billingDate, billingNumber) VALUES ('sMIGRATION06', 'eMIGRATION06', '2024-04-01', 'LA-1')",
    );
    await pool.query(
      "INSERT INTO Allocations (allocationUID, invoiceUID, billingUID, reimbursement) VALUES ('lMIGRATION06', 'iMIGRATION06', 'sMIGRATION06', 80)",
    );

    await migrator.up();

    const count = async (table: string): Promise<number> =>
      Number((await pool.query<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n);
    for (const table of ['Allocations', 'ServiceBillings', 'Submissions', 'Contracts']) {
      assert.equal(await count(table), 0, `${table} should be emptied`);
    }
    const [invoice] = await pool.query<unknown[]>(
      "SELECT 1 FROM Invoices WHERE invoiceUID = 'iMIGRATION06'",
    );
    assert.ok(invoice, 'the invoice is kept');
    assert.equal(await count('SubmissionInvoices'), 0, 'the invoice is no longer submitted');
    const kept = async (sql: string): Promise<boolean> =>
      (await pool.query<unknown[]>(sql)).length === 1;
    assert.ok(
      await kept("SELECT 1 FROM Accounts WHERE accountUID = 'aMIGRATION06'"),
      'the account is kept',
    );
    assert.ok(
      await kept("SELECT 1 FROM InsuranceCompanies WHERE companyUID = 'vMIGRATION06'"),
      'the company is kept',
    );

    await pool.query("DELETE FROM InvoiceTreatmentDays WHERE invoiceUID = 'iMIGRATION06'");
    await pool.query("DELETE FROM Invoices WHERE invoiceUID = 'iMIGRATION06'");
    await pool.query("DELETE FROM InsuranceCompanies WHERE companyUID = 'vMIGRATION06'");
    await pool.query("DELETE FROM Accounts WHERE accountUID = 'aMIGRATION06'");
  } finally {
    await pool.end();
  }
});

test('migration 007 moves submissions into SubmissionInvoices and back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const cleanup = async (): Promise<void> => {
    for (const sql of [
      "DELETE FROM SubmissionInvoices WHERE invoiceUID = 'iMIGRATION07'",
      "DELETE FROM InvoiceTreatmentDays WHERE invoiceUID = 'iMIGRATION07'",
      "DELETE FROM Invoices WHERE invoiceUID = 'iMIGRATION07'",
      "DELETE FROM Submissions WHERE submissionUID IN ('eMIGRATIO07A', 'eMIGRATIO07B')",
      "DELETE FROM Contracts WHERE contractUID IN ('pMIGRATIO07A', 'pMIGRATIO07B')",
      "DELETE FROM InsuranceCompanies WHERE companyUID = 'vMIGRATION07'",
      "DELETE FROM Accounts WHERE accountUID = 'aMIGRATION07'",
    ]) {
      await pool.query(sql);
    }
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name007 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('007-'));
    assert.ok(name007, 'migration 007 should be recorded');

    await cleanup();
    await migrator.down({ to: name007 });
    await pool.query(
      "INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES ('aMIGRATION07', 'Mig', '1990-01-01')",
    );
    await pool.query(
      "INSERT INTO InsuranceCompanies (companyUID, companyName) VALUES ('vMIGRATION07', 'Mig AG')",
    );
    for (const contract of ['pMIGRATIO07A', 'pMIGRATIO07B']) {
      await pool.query(
        `INSERT INTO Contracts (contractUID, contractNumber, companyUID, accountUID, contractBegin)
         VALUES (?, ?, 'vMIGRATION07', 'aMIGRATION07', '2020-01-01')`,
        [contract, contract],
      );
    }
    await pool.query(
      `INSERT INTO Submissions (submissionUID, contractUID, submittedDate)
       VALUES ('eMIGRATIO07A', 'pMIGRATIO07A', '2024-03-01'),
              ('eMIGRATIO07B', 'pMIGRATIO07B', '2024-04-01')`,
    );
    await pool.query(
      `INSERT INTO Invoices (invoiceUID, invoiceNumber, invoiceDate, treatmentDate, accountUID, submissionUID, invoiceAmount)
       VALUES ('iMIGRATION07', 'R-7', '2024-02-01', '2024-02-01', 'aMIGRATION07', 'eMIGRATIO07A', 100)`,
    );

    await migrator.up();
    const links = async (): Promise<Array<{ submissionUID: string; contractUID: string }>> =>
      pool.query(
        `SELECT submissionUID, contractUID FROM SubmissionInvoices
          WHERE invoiceUID = 'iMIGRATION07' ORDER BY submissionUID`,
      );
    assert.deepEqual(await links(), [
      { submissionUID: 'eMIGRATIO07A', contractUID: 'pMIGRATIO07A' },
    ]);

    // Once per policy is enforced by the schema itself.
    await assert.rejects(
      pool.query(
        "INSERT INTO SubmissionInvoices VALUES ('eMIGRATIO07B', 'iMIGRATION07', 'pMIGRATIO07A')",
      ),
      'the contract copy must match the submission',
    );
    await pool.query(
      "INSERT INTO SubmissionInvoices VALUES ('eMIGRATIO07B', 'iMIGRATION07', 'pMIGRATIO07B')",
    );

    // down keeps one submission per invoice (the smallest UID).
    await migrator.down({ to: name007 });
    const [invoice] = await pool.query<Array<{ submissionUID: string | null }>>(
      "SELECT submissionUID FROM Invoices WHERE invoiceUID = 'iMIGRATION07'",
    );
    assert.equal(invoice?.submissionUID, 'eMIGRATIO07A');

    await migrator.up();
    assert.equal((await links()).length, 1);
  } finally {
    await cleanup().catch(() => undefined);
    await pool.end();
  }
});

test('migration 008 adds the bonus scale, the year records and the billing flag, and back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const schema = async (): Promise<{ tables: string[]; hasFlag: boolean }> => {
    const tables = await pool.query<Array<{ name: string }>>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN ('ContractBonusTiers', 'ContractYears')
        ORDER BY table_name`,
    );
    const flag = await pool.query<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ServiceBillings'
          AND column_name = 'forfeitsBonus'`,
    );
    return { tables: tables.map((row) => row.name), hasFlag: Number(flag[0]?.n) === 1 };
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name008 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('008-'));
    assert.ok(name008, 'migration 008 should be recorded');
    assert.deepEqual(await schema(), {
      tables: ['ContractBonusTiers', 'ContractYears'],
      hasFlag: true,
    });

    await migrator.down({ to: name008 });
    assert.deepEqual(await schema(), { tables: [], hasFlag: false });

    await migrator.up();
    assert.deepEqual(await schema(), {
      tables: ['ContractBonusTiers', 'ContractYears'],
      hasFlag: true,
    });
  } finally {
    await pool.end();
  }
});

test('migration 011 moves a billing onto its policy and guards the number, and back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const cleanup = async (): Promise<void> => {
    for (const sql of [
      "DELETE FROM Allocations WHERE allocationUID LIKE 'oMIGRATIO11%'",
      "DELETE FROM ServiceBillings WHERE billingUID LIKE 'sMIGRATIO11%'",
      "DELETE FROM SubmissionInvoices WHERE invoiceUID LIKE 'iMIGRATION11%'",
      "DELETE FROM InvoiceTreatmentDays WHERE invoiceUID LIKE 'iMIGRATION11%'",
      "DELETE FROM Invoices WHERE invoiceUID LIKE 'iMIGRATION11%'",
      "DELETE FROM Submissions WHERE submissionUID LIKE 'eMIGRATIO11%'",
      "DELETE FROM Contracts WHERE contractUID LIKE 'pMIGRATIO11%'",
      "DELETE FROM InsuranceCompanies WHERE companyUID = 'vMIGRATION11'",
      "DELETE FROM Accounts WHERE accountUID = 'aMIGRATION11'",
    ]) {
      await pool.query(sql);
    }
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name011 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('011-'));
    assert.ok(name011, 'migration 011 should be recorded');

    await cleanup();
    // Back to the old shape: a billing hangs off one submission.
    await migrator.down({ to: name011 });
    await pool.query(
      "INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES ('aMIGRATION11', 'Mig', '1990-01-01')",
    );
    await pool.query(
      "INSERT INTO InsuranceCompanies (companyUID, companyName) VALUES ('vMIGRATION11', 'Mig AG')",
    );
    for (const contract of ['pMIGRATIO11A', 'pMIGRATIO11B']) {
      await pool.query(
        `INSERT INTO Contracts (contractUID, contractNumber, companyUID, accountUID, contractBegin)
         VALUES (?, ?, 'vMIGRATION11', 'aMIGRATION11', '2020-01-01')`,
        [contract, contract],
      );
    }
    await pool.query(
      `INSERT INTO Submissions (submissionUID, contractUID, submittedDate)
       VALUES ('eMIGRATIO11A', 'pMIGRATIO11A', '2024-03-01'),
              ('eMIGRATIO11B', 'pMIGRATIO11B', '2024-04-01')`,
    );
    await pool.query(
      `INSERT INTO Invoices (invoiceUID, invoiceNumber, invoiceDate, treatmentDate, accountUID, invoiceAmount)
       VALUES ('iMIGRATION11', 'R-11', '2024-02-01', '2024-02-01', 'aMIGRATION11', 100)`,
    );
    await pool.query(
      "INSERT INTO SubmissionInvoices VALUES ('eMIGRATIO11A', 'iMIGRATION11', 'pMIGRATIO11A')",
    );
    await pool.query(
      `INSERT INTO ServiceBillings (billingUID, submissionUID, billingDate, billingNumber)
       VALUES ('sMIGRATIO11A', 'eMIGRATIO11A', '2024-05-01', 'LA-11'),
              ('sMIGRATIO11B', 'eMIGRATIO11B', '2024-05-01', 'LA-11')`,
    );
    await pool.query(
      `INSERT INTO Allocations (allocationUID, invoiceUID, billingUID, reimbursement)
       VALUES ('oMIGRATIO11A', 'iMIGRATION11', 'sMIGRATIO11A', 40)`,
    );

    await migrator.up();

    // The billing now names the policy its submission belonged to; the same
    // number under two different policies is untouched (the family case).
    const billings = await pool.query<Array<{ billingUID: string; contractUID: string }>>(
      `SELECT billingUID, contractUID FROM ServiceBillings
        WHERE billingUID LIKE 'sMIGRATIO11%' ORDER BY billingUID`,
    );
    assert.deepEqual(billings, [
      { billingUID: 'sMIGRATIO11A', contractUID: 'pMIGRATIO11A' },
      { billingUID: 'sMIGRATIO11B', contractUID: 'pMIGRATIO11B' },
    ]);

    // UNIQUE (contractUID, billingNumber) holds for active billings...
    await assert.rejects(
      pool.query(
        `INSERT INTO ServiceBillings (billingUID, contractUID, billingDate, billingNumber)
         VALUES ('sMIGRATIO11C', 'pMIGRATIO11A', '2024-06-01', 'LA-11')`,
      ),
      'a policy must not carry the same billing number twice',
    );
    // ...and a soft-deleted one gives its number back, because the generated
    // column turns NULL and NULL never collides.
    await pool.query(
      "UPDATE ServiceBillings SET billingStatus = -1 WHERE billingUID = 'sMIGRATIO11A'",
    );
    await pool.query(
      `INSERT INTO ServiceBillings (billingUID, contractUID, billingDate, billingNumber)
       VALUES ('sMIGRATIO11C', 'pMIGRATIO11A', '2024-06-01', 'LA-11')`,
    );
    await pool.query("DELETE FROM ServiceBillings WHERE billingUID = 'sMIGRATIO11C'");
    await pool.query(
      "UPDATE ServiceBillings SET billingStatus = 1 WHERE billingUID = 'sMIGRATIO11A'",
    );

    // down puts the billing back on the submission of the invoice it booked.
    await migrator.down({ to: name011 });
    const [restored] = await pool.query<Array<{ submissionUID: string }>>(
      "SELECT submissionUID FROM ServiceBillings WHERE billingUID = 'sMIGRATIO11A'",
    );
    assert.equal(restored?.submissionUID, 'eMIGRATIO11A');

    await migrator.up();
  } finally {
    await cleanup().catch(() => undefined);
    await pool.end();
  }
});

test('migration 012 turns an agency account into a history, and back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const cleanup = async (): Promise<void> => {
    for (const sql of [
      "DELETE FROM AgencyBankAccounts WHERE agencyUID = 'cMIGRATION12'",
      "DELETE FROM CollectionAgencies WHERE agencyUID = 'cMIGRATION12'",
    ]) {
      await pool.query(sql).catch(() => undefined);
    }
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name012 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('012-'));
    assert.ok(name012, 'migration 012 should be recorded');

    await cleanup();
    // Back to the old shape: the agency carries exactly one IBAN.
    await migrator.down({ to: name012 });
    await pool.query(
      `INSERT INTO CollectionAgencies (agencyUID, agencyName, bankAccount)
       VALUES ('cMIGRATION12', 'Mig Inkasso', 'DE02120300000000202051')`,
    );

    await migrator.up();

    // The account known so far became the undated first entry, and the column
    // it came from is gone.
    const accounts = await pool.query<Array<{ validFrom: string | null; bankAccount: string }>>(
      "SELECT validFrom, bankAccount FROM AgencyBankAccounts WHERE agencyUID = 'cMIGRATION12'",
    );
    assert.deepEqual(accounts, [{ validFrom: null, bankAccount: 'DE02120300000000202051' }]);
    const columns = await pool.query<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'CollectionAgencies'
          AND column_name = 'bankAccount'`,
    );
    assert.equal(Number(columns[0]?.n), 0);

    // The undated entry's UID is derived from the agency's own, so a second
    // account needs a different one.
    assert.equal(
      (
        await pool.query<Array<{ uid: string }>>(
          "SELECT agencyAccountUID AS uid FROM AgencyBankAccounts WHERE agencyUID = 'cMIGRATION12'",
        )
      )[0]?.uid,
      'gMIGRATION12',
    );

    // down keeps the account in force — the later one, not the undated one.
    await pool.query(
      `INSERT INTO AgencyBankAccounts (agencyAccountUID, agencyUID, validFrom, bankAccount)
       VALUES ('gMIGRATIO12B', 'cMIGRATION12', '2026-01-01', 'DE89370400440532013000')`,
    );
    await migrator.down({ to: name012 });
    const [restored] = await pool.query<Array<{ bankAccount: string }>>(
      "SELECT bankAccount FROM CollectionAgencies WHERE agencyUID = 'cMIGRATION12'",
    );
    assert.equal(restored?.bankAccount, 'DE89370400440532013000');

    await migrator.up();
  } finally {
    await cleanup().catch(() => undefined);
    await pool.end();
  }
});

test('migration 014 gives every invoice its treatment day, and takes it back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const cleanup = async (): Promise<void> => {
    for (const sql of [
      "DELETE FROM InvoiceTreatmentDays WHERE invoiceUID = 'iMIGRATION14'",
      "DELETE FROM Invoices WHERE invoiceUID = 'iMIGRATION14'",
      "DELETE FROM Accounts WHERE accountUID = 'aMIGRATION14'",
    ]) {
      await pool.query(sql).catch(() => undefined);
    }
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name014 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('014-'));
    assert.ok(name014, 'migration 014 should be recorded');

    await cleanup();
    // Back to the one-day shape, with an invoice from before the change. It is
    // soft-deleted on purpose: what is in the trash must carry its day too, or
    // a restore would bring back an invoice without one.
    await migrator.down({ to: name014 });
    await pool.query(
      "INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES ('aMIGRATION14', 'Mig', '1990-01-01')",
    );
    await pool.query(
      `INSERT INTO Invoices (invoiceUID, invoiceNumber, invoiceDate, treatmentDate, accountUID,
                             invoiceAmount, invoiceStatus)
       VALUES ('iMIGRATION14', 'R-14', '2024-02-01', '2024-02-03', 'aMIGRATION14', 100, -1)`,
    );

    await migrator.up();

    const days = await pool.query<Array<{ treatmentDate: string }>>(
      "SELECT treatmentDate FROM InvoiceTreatmentDays WHERE invoiceUID = 'iMIGRATION14'",
    );
    assert.deepEqual(days, [{ treatmentDate: '2024-02-03' }], 'the day it already had');

    // The same day twice is a typo, not a date — the primary key says so.
    await assert.rejects(
      pool.query(
        `INSERT INTO InvoiceTreatmentDays (invoiceUID, treatmentDate)
         VALUES ('iMIGRATION14', '2024-02-03')`,
      ),
      'a day cannot be recorded twice for one invoice',
    );

    // down only takes the table away: the leading day never left the invoice.
    await migrator.down({ to: name014 });
    const [invoice] = await pool.query<Array<{ treatmentDate: string }>>(
      "SELECT treatmentDate FROM Invoices WHERE invoiceUID = 'iMIGRATION14'",
    );
    assert.equal(invoice?.treatmentDate, '2024-02-03');

    await migrator.up();
  } finally {
    await cleanup().catch(() => undefined);
    await pool.end();
  }
});

test('migration 015 adds the "not covered" mark and takes it back', async (t) => {
  const config = databaseConfigFromEnv();
  if (!config) {
    t.skip('no database configured (DB_* env vars unset)');
    return;
  }
  const pool = createPool(config);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return;
  }

  const columnsOfInvoices = async (): Promise<string[]> => {
    const rows = await pool.query<Array<{ COLUMN_NAME: string }>>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Invoices'`,
    );
    return rows.map((row) => row.COLUMN_NAME);
  };

  const cleanup = async (): Promise<void> => {
    for (const sql of [
      "DELETE FROM InvoiceTreatmentDays WHERE invoiceUID = 'iMIGRATION15'",
      "DELETE FROM Invoices WHERE invoiceUID = 'iMIGRATION15'",
      "DELETE FROM Accounts WHERE accountUID = 'aMIGRATION15'",
    ]) {
      await pool.query(sql).catch(() => undefined);
    }
  };

  try {
    await runMigrations(pool);
    const migrator = createMigrator(pool);
    const name015 = (await migrator.executed())
      .map((m) => m.name)
      .find((n) => n.startsWith('015-'));
    assert.ok(name015, 'migration 015 should be recorded');

    await cleanup();
    // Back to the shape without the mark, with an invoice from before it.
    await migrator.down({ to: name015 });
    const before = await columnsOfInvoices();
    assert.ok(!before.includes('notCovered'), 'the flag is gone after down');
    assert.ok(!before.includes('notCoveredReason'), 'the reason is gone after down');

    await pool.query(
      "INSERT INTO Accounts (accountUID, firstname, birthDate) VALUES ('aMIGRATION15', 'Mig', '1990-01-01')",
    );
    await pool.query(
      `INSERT INTO Invoices (invoiceUID, invoiceNumber, invoiceDate, treatmentDate, accountUID,
                             invoiceAmount)
       VALUES ('iMIGRATION15', 'R-15', '2024-03-01', '2024-03-02', 'aMIGRATION15', 100)`,
    );

    await migrator.up();

    // Every invoice recorded so far is covered: none of them was ever marked,
    // because there was nothing to mark with.
    const [invoice] = await pool.query<Array<{ notCovered: number; notCoveredReason: null }>>(
      "SELECT notCovered, notCoveredReason FROM Invoices WHERE invoiceUID = 'iMIGRATION15'",
    );
    assert.equal(Number(invoice?.notCovered), 0);
    assert.equal(invoice?.notCoveredReason, null);
  } finally {
    await cleanup().catch(() => undefined);
    await pool.end();
  }
});
