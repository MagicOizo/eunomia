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
  'Facilities',
  'CollectionAgencies',
  'Submissions',
  'SubmissionInvoices',
  'InvoiceExclusions',
  'Invoices',
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
