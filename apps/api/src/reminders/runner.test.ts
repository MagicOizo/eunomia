import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import type { Mailer, MailMessage, MailSendStatus } from '../mail/mailer.js';
import { createReminderRunner } from './runner.js';
import type {
  PayableInvoiceRow,
  ReminderRecord,
  ReminderRunStatus,
  ReminderSettings,
  ReminderStore,
  StoredRunStatus,
} from './store.js';

/**
 * The runner talks to a store and a mailer, so these tests need neither a
 * database nor a socket — the same arrangement as mail/mailer.test.ts.
 */

const SETTINGS: ReminderSettings = {
  enabled: true,
  mailEnabled: true,
  hour: 7,
  timeZone: 'Europe/Berlin',
  repeatDays: 7,
  appUrl: null,
};

/** 08:00 Berlin on 2026-09-24, so the run's calendar day is that day. */
const NOW = new Date('2026-09-24T06:00:00Z');

function invoice(overrides: Partial<PayableInvoiceRow> = {}): PayableInvoiceRow {
  return {
    invoiceUID: 'inv_000000001',
    invoiceNumber: '2026-0042',
    accountUID: 'acc_000000001',
    accountName: 'Mia Musterfrau',
    payee: 'Praxis Dr. Meier',
    amount: 128.4,
    transferDate: null,
    transferUntilDate: '2026-09-29',
    directPayment: false,
    ...overrides,
  };
}

interface StubOptions {
  settings?: Partial<ReminderSettings>;
  invoices?: PayableInvoiceRow[];
  recipients?: Array<{
    userId: number;
    email: string;
    name: string;
    all: boolean;
    accountUIDs: string[];
  }>;
  history?: ReminderRecord[];
}

/** An in-memory store that records what the run writes back. */
function stubStore(options: StubOptions = {}) {
  const recorded: ReminderRecord[] = [];
  const statuses: ReminderRunStatus[] = [];
  const store: ReminderStore = {
    readSettings: async () => ({ ...SETTINGS, ...options.settings }),
    readStatus: async (): Promise<StoredRunStatus> => ({
      lastRunAt: null,
      lastRunResult: null,
      lastRunError: null,
      lastRunSent: null,
    }),
    writeStatus: async (status) => void statuses.push(status),
    listPayableInvoices: async () => options.invoices ?? [invoice()],
    listRecipients: async () =>
      options.recipients ?? [
        { userId: 1, email: 'max@example.com', name: 'Max', all: true, accountUIDs: [] },
      ],
    listReminders: async () => options.history ?? [],
    recordReminders: async (records) => void recorded.push(...records),
  };
  return { store, recorded, statuses };
}

/** A mailer that collects messages, or fails on every send. */
function stubMailer(failure?: ApiError) {
  const sent: MailMessage[] = [];
  const status: MailSendStatus = { lastSendAt: null, lastSendResult: null, lastSendError: null };
  const mailer: Mailer = {
    sendMail: async (message) => {
      if (failure) throw failure;
      sent.push(message);
      return status;
    },
    sendTestMail: async () => status,
    readStatus: async () => status,
  };
  return { mailer, sent };
}

test('a due invoice is announced once, and not again the next day', async () => {
  const { store, recorded, statuses } = stubStore();
  const { mailer, sent } = stubMailer();
  const runner = createReminderRunner(store, mailer, { now: () => NOW });

  const first = await runner.run();
  assert.equal(first.sent, 1);
  assert.equal(sent[0]?.to, 'max@example.com');
  assert.match(sent[0]?.subject ?? '', /1 fällige Zahlung/);
  assert.deepEqual(recorded, [
    { invoiceUID: 'inv_000000001', userId: 1, stage: 'due', sentOn: '2026-09-24' },
  ]);
  assert.equal(statuses[0]?.lastRunResult, 'ok');
  assert.equal(statuses[0]?.lastRunSent, 1);

  // Same state, one day later: a due invoice does not repeat — an invoice with
  // no due date is due forever and would otherwise nag forever.
  const second = stubStore({ history: recorded });
  const later = stubMailer();
  await createReminderRunner(second.store, later.mailer, {
    now: () => new Date('2026-09-25T06:00:00Z'),
  }).run();
  assert.equal(later.sent.length, 0);
});

test('the step from due to overdue is worth another mail', async () => {
  const { store } = stubStore({
    invoices: [invoice({ transferUntilDate: '2026-09-23' })],
    history: [{ invoiceUID: 'inv_000000001', userId: 1, stage: 'due', sentOn: '2026-09-22' }],
  });
  const { mailer, sent } = stubMailer();

  const result = await createReminderRunner(store, mailer, { now: () => NOW }).run();

  assert.equal(result.sent, 1);
  assert.match(sent[0]?.subject ?? '', /1 überfällige Zahlung/);
  assert.match(sent[0]?.text ?? '', /seit 1 Tag überfällig/);
});

test('an overdue invoice repeats only after the configured interval', async () => {
  const overdue = [invoice({ transferUntilDate: '2026-09-01' })];
  const tooSoon = stubStore({
    invoices: overdue,
    history: [{ invoiceUID: 'inv_000000001', userId: 1, stage: 'overdue', sentOn: '2026-09-20' }],
  });
  const quiet = stubMailer();
  await createReminderRunner(tooSoon.store, quiet.mailer, { now: () => NOW }).run();
  assert.equal(quiet.sent.length, 0, 'four days after the last reminder');

  const ripe = stubStore({
    invoices: overdue,
    history: [{ invoiceUID: 'inv_000000001', userId: 1, stage: 'overdue', sentOn: '2026-09-17' }],
  });
  const loud = stubMailer();
  await createReminderRunner(ripe.store, loud.mailer, { now: () => NOW }).run();
  assert.equal(loud.sent.length, 1, 'exactly seven days after the last reminder');
});

test('paid, cash-paid and not-yet-due invoices are never mentioned', async () => {
  const { store } = stubStore({
    invoices: [
      invoice({ invoiceUID: 'inv_paid', transferDate: '2026-09-20' }),
      invoice({ invoiceUID: 'inv_cash', directPayment: true }),
      invoice({ invoiceUID: 'inv_far', transferUntilDate: '2026-12-01' }),
    ],
  });
  const { mailer, sent } = stubMailer();

  const result = await createReminderRunner(store, mailer, { now: () => NOW }).run();

  assert.equal(sent.length, 0);
  assert.equal(result.recipients, 0);
  // They were all considered — the rule, not the query, sorted them out.
  assert.equal(result.invoices, 3);
});

test('a recipient hears only about the accounts they may see', async () => {
  const { store } = stubStore({
    invoices: [
      invoice({ invoiceUID: 'inv_mine', accountUID: 'acc_mine', invoiceNumber: '2026-0001' }),
      invoice({ invoiceUID: 'inv_other', accountUID: 'acc_other', invoiceNumber: '2026-0002' }),
    ],
    recipients: [
      {
        userId: 2,
        email: 'scoped@example.com',
        name: 'Nur',
        all: false,
        accountUIDs: ['acc_mine'],
      },
    ],
  });
  const { mailer, sent } = stubMailer();

  await createReminderRunner(store, mailer, { now: () => NOW }).run();

  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? '', /2026-0001/);
  assert.ok(!(sent[0]?.text ?? '').includes('2026-0002'));
});

test('a failed send stamps nothing, so the next run tries again', async () => {
  const { store, recorded, statuses } = stubStore();
  const { mailer } = stubMailer(
    new ApiError(502, ERROR_CODES.MAIL_SEND_FAILED, 'Sending mail failed: 535 Auth failed'),
  );

  const result = await createReminderRunner(store, mailer, { now: () => NOW }).run();

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(recorded, []);
  assert.equal(statuses[0]?.lastRunResult, 'error');
  assert.match(statuses[0]?.lastRunError ?? '', /535/);
});

test('switched off, or without mail, the run touches nothing at all', async () => {
  for (const [settings, skipped] of [
    [{ enabled: false }, 'disabled'],
    [{ mailEnabled: false }, 'mail_not_configured'],
  ] as const) {
    const { store, recorded, statuses } = stubStore({ settings });
    const { mailer, sent } = stubMailer();

    const result = await createReminderRunner(store, mailer, { now: () => NOW }).run();

    assert.equal(result.skipped, skipped);
    assert.equal(sent.length, 0);
    assert.deepEqual(recorded, []);
    // An incomplete configuration must not paint the status red: nothing was
    // attempted, so a red light would be a lie (same rule as the mailer).
    assert.deepEqual(statuses, []);
  }
});

test('a dry run renders everything and changes nothing', async () => {
  const { store, recorded, statuses } = stubStore();
  const { mailer, sent } = stubMailer();

  const result = await createReminderRunner(store, mailer, { now: () => NOW }).run({
    dryRun: true,
  });

  assert.equal(sent.length, 0);
  assert.deepEqual(recorded, []);
  assert.deepEqual(statuses, []);
  assert.equal(result.recipients, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.preview[0]?.email, 'max@example.com');
  assert.match(result.preview[0]?.text ?? '', /2026-0042/);
});
