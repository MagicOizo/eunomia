import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import type { Pool } from 'mariadb';
import request from 'supertest';

import { createApp } from '../app.js';
import { hashPassword } from '../lib/password.js';
import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { ApiError } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import type { MailMessage, MailSendStatus, Mailer } from '../mail/mailer.js';
import { createReminderRunner } from './runner.js';
import { createReminderStore } from './store.js';

/**
 * Payment reminders end to end (Slice 31): the permission gate, the refusal
 * while switched off, what a dry run does and does not do, that a real run
 * mails the right person about the right invoices, and that the second run
 * stays quiet. The mailer is stubbed — the SMTP side is covered in
 * mail/mailer.test.ts; what matters here is the database and the API.
 *
 * Skips without a database; CI provides one. IT DELETES DATA — point DB_NAME
 * at a throwaway schema.
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

const SETUP_TOKEN = 'test-setup-token';

function testConfig(database: DatabaseConfig): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database,
    auth: {
      jwtSecret: 'test-secret-please-ignore',
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
    configEncryptionKey: randomBytes(32),
  };
}

async function resetData(pool: Pool): Promise<void> {
  // Leftovers from another suite's run may still reference the invoices, so
  // the whole workflow chain goes first — in foreign-key order.
  for (const stmt of [
    'DELETE FROM InvoiceReminders',
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
    'DELETE FROM SystemSettings',
    'DELETE FROM UserAccountRoles',
    'DELETE FROM UserRoles',
    'DELETE FROM RefreshTokens',
    'DELETE FROM Users',
    'DELETE FROM Accounts',
  ]) {
    await pool.query(stmt);
  }
}

const EMPTY_STATUS: MailSendStatus = {
  lastSendAt: null,
  lastSendResult: null,
  lastSendError: null,
};

/** A mailer that records instead of connecting. */
function stubMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    sendMail: async (message) => {
      sent.push(message);
      return EMPTY_STATUS;
    },
    sendTestMail: async () => EMPTY_STATUS,
    readStatus: async () => EMPTY_STATUS,
  };
  return { mailer, sent };
}

async function countReminders(pool: Pool): Promise<number> {
  const rows = await pool.query<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM InvoiceReminders');
  return rows[0]?.n ?? 0;
}

/** `YYYY-MM-DD`, `offset` days from today — the run uses the real clock. */
function dayOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

test('payment reminders: gating, dry run, delivery and the quiet second run', async (t) => {
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

    // Two insured persons, three invoices: one overdue each, and one still far
    // off — so "only what is due" and "only my accounts" are both visible.
    const account = async (firstname: string): Promise<string> =>
      (
        await request(app)
          .post('/api/v1/accounts')
          .set(admin)
          .send({ firstname, birthDate: '1985-04-12' })
      ).body.data.accountUID as string;
    const mine = await account('Anna');
    const other = await account('Bea');

    const invoice = async (
      accountUID: string,
      invoiceNumber: string,
      transferUntilDate: string,
    ): Promise<void> => {
      const res = await request(app).post('/api/v1/invoices').set(admin).send({
        invoiceNumber,
        invoiceDate: '2026-01-05',
        treatmentDate: '2026-01-05',
        accountUID,
        invoiceAmount: 120.5,
        transferUntilDate,
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    };

    await invoice(mine, 'R-OVERDUE', dayOffset(-5));
    await invoice(other, 'R-OTHER', dayOffset(-5));
    await invoice(mine, 'R-LATER', dayOffset(60));

    // A user who may see only Anna's account.
    const scopedPassword = 'scopeduser1';
    const scoped = (await pool.query(
      'INSERT INTO Users (email, firstname, passwordHash) VALUES (?, ?, ?)',
      ['scoped@example.com', 'Nur', await hashPassword(scopedPassword)],
    )) as { insertId: number };
    const nutzer = (
      await pool.query<Array<{ roleID: number }>>(
        "SELECT roleID FROM Roles WHERE roleName = 'Nutzer'",
      )
    )[0];
    await pool.query('INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)', [
      scoped.insertId,
      nutzer?.roleID,
      mine,
    ]);
    const scopedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'scoped@example.com', password: scopedPassword });
    const user = { Authorization: `Bearer ${scopedLogin.body.accessToken}` };

    await t.test('only MANAGE_SETTINGS may trigger a run', async () => {
      assert.equal((await request(app).post('/api/v1/settings/reminders/run')).status, 401);
      assert.equal(
        (await request(app).post('/api/v1/settings/reminders/run').set(user)).status,
        403,
      );
    });

    await t.test('switched off, the button refuses instead of silently sending', async () => {
      const res = await request(app).post('/api/v1/settings/reminders/run').set(admin).send({});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, ERROR_CODES.REMINDERS_DISABLED);
    });

    await t.test('without mail, the run says so rather than failing obscurely', async () => {
      await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'reminders.enabled': true } });

      const res = await request(app).post('/api/v1/settings/reminders/run').set(admin).send({});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, ERROR_CODES.MAIL_NOT_CONFIGURED);
      assert.equal(await countReminders(pool), 0);
    });

    await t.test('the payee is the beneficiary the agency names, where it names one', async () => {
      const agency = await request(app)
        .post('/api/v1/agencies')
        .set(admin)
        .send({ agencyName: 'Inkasso Mahnung', bankAccount: 'DE02120300000000202051' });
      const agencyUID = agency.body.data.agencyUID as string;
      // The account in force names a beneficiary of its own; the undated one
      // (from creating the agency) does not, and must not win.
      const inForce = await request(app)
        .post(`/api/v1/agencies/${agencyUID}/accounts`)
        .set(admin)
        .send({
          validFrom: dayOffset(-30),
          bankAccount: 'DE89370400440532013000',
          recipientName: 'Zahlstelle Mahnung',
        });
      const invoiceUID = (
        await pool.query<Array<{ uid: string }>>(
          "SELECT invoiceUID AS uid FROM Invoices WHERE invoiceNumber = 'R-OVERDUE'",
        )
      )[0]?.uid;
      await request(app).patch(`/api/v1/invoices/${invoiceUID}`).set(admin).send({ agencyUID });

      const payable = await createReminderStore(pool, config.configEncryptionKey)
        .listPayableInvoices()
        .then((rows) => rows.find((row) => row.invoiceNumber === 'R-OVERDUE'));
      assert.equal(payable?.payee, 'Zahlstelle Mahnung');

      // Without a beneficiary the agency's own name carries the line.
      await request(app)
        .patch(`/api/v1/agencies/${agencyUID}/accounts/${inForce.body.data.agencyAccountUID}`)
        .set(admin)
        .send({ recipientName: null });
      const withoutBeneficiary = await createReminderStore(pool, config.configEncryptionKey)
        .listPayableInvoices()
        .then((rows) => rows.find((row) => row.invoiceNumber === 'R-OVERDUE'));
      assert.equal(withoutBeneficiary?.payee, 'Inkasso Mahnung');

      await request(app)
        .patch(`/api/v1/invoices/${invoiceUID}`)
        .set(admin)
        .send({ agencyUID: null });
    });

    await t.test('a dry run renders each recipient their own mail and stores nothing', async () => {
      await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({
          values: {
            'mail.enabled': true,
            'mail.host': 'localhost',
            'mail.fromAddress': 'eunomia@example.com',
          },
        });

      const res = await request(app)
        .post('/api/v1/settings/reminders/run')
        .set(admin)
        .send({ dryRun: true });

      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.dryRun, true);
      // The global admin and the scoped user both have something to hear about.
      assert.equal(res.body.data.recipients, 2);
      assert.equal(res.body.data.sent, 0);
      assert.equal(await countReminders(pool), 0);

      const preview = res.body.data.preview as Array<{ email: string; text: string }>;
      const scopedMail = preview.find((entry) => entry.email === 'scoped@example.com');
      assert.ok(scopedMail, 'the scoped user gets a mail of their own');
      assert.match(scopedMail.text, /R-OVERDUE/);
      // Bea's invoice is none of their business, and R-LATER is not due yet.
      assert.ok(!scopedMail.text.includes('R-OTHER'));
      assert.ok(!scopedMail.text.includes('R-LATER'));

      const adminMail = preview.find((entry) => entry.email === 'admin@example.com');
      assert.ok(adminMail, 'a global grant reaches every account');
      assert.match(adminMail.text, /R-OTHER/);
    });

    /*
     * The delivering run bypasses HTTP: the route builds its mailer from the
     * settings, and there is no SMTP server here. What matters below is the
     * database — who is found, what is stamped, and what the second run does —
     * so the runner is driven directly with a stub mailer, as its unit tests do.
     */
    const store = createReminderStore(pool, config.configEncryptionKey);

    await t.test('a real run mails every recipient and stamps what it named', async () => {
      const { mailer, sent } = stubMailer();
      const result = await createReminderRunner(store, mailer).run();

      assert.equal(result.sent, 2);
      assert.equal(result.failed, 0);
      assert.deepEqual(sent.map((message) => message.to).sort(), [
        'admin@example.com',
        'scoped@example.com',
      ]);
      // Anna's overdue invoice for both, Bea's for the admin alone: three rows.
      assert.equal(await countReminders(pool), 3);

      const stored = await pool.query<Array<{ stage: string }>>(
        'SELECT DISTINCT stage FROM InvoiceReminders',
      );
      assert.deepEqual(
        stored.map((row) => row.stage),
        ['overdue'],
      );
    });

    await t.test('the next run the same day says nothing again', async () => {
      const { mailer, sent } = stubMailer();
      const result = await createReminderRunner(store, mailer).run();

      assert.equal(sent.length, 0);
      assert.equal(result.sent, 0);
      assert.equal(await countReminders(pool), 3);
    });

    await t.test('a failed send is not stamped, so it is tried again', async () => {
      await pool.query('DELETE FROM InvoiceReminders');
      const failing: Mailer = {
        sendMail: async () => {
          throw new ApiError(502, ERROR_CODES.MAIL_SEND_FAILED, 'Sending mail failed: refused');
        },
        sendTestMail: async () => EMPTY_STATUS,
        readStatus: async () => EMPTY_STATUS,
      };

      const result = await createReminderRunner(store, failing).run();

      assert.equal(result.sent, 0);
      assert.equal(result.failed, 2);
      assert.equal(await countReminders(pool), 0);
    });

    await t.test('the run status ends up in the settings the page reads', async () => {
      const res = await request(app).get('/api/v1/settings').set(admin);
      const settings = res.body.data.settings as Array<{ key: string; value: unknown }>;
      const value = (key: string): unknown => settings.find((entry) => entry.key === key)?.value;

      assert.equal(value('reminders.lastRunResult'), 'error');
      assert.equal(value('reminders.lastRunSent'), 0);
      assert.match(String(value('reminders.lastRunAt')), /^\d{4}-\d{2}-\d{2}T/);
      assert.match(String(value('reminders.lastRunError')), /refused/);
    });
  } finally {
    await pool.end();
  }
});
