import assert from 'node:assert/strict';
import test from 'node:test';

import { type ReminderEntry, renderReminderMail, reminderSubject } from './message.js';

const TODAY = '2026-09-24';

function entry(overrides: Partial<ReminderEntry> = {}): ReminderEntry {
  return {
    invoiceUID: 'inv_000000001',
    invoiceNumber: '2026-0042',
    accountName: 'Mia Musterfrau',
    payee: 'Praxis Dr. Meier',
    amount: 128.4,
    transferUntilDate: '2026-09-29',
    stage: 'due',
    ...overrides,
  };
}

test('the subject names the overdue group first and counts in German', () => {
  assert.equal(reminderSubject([entry()]), 'Eunomia: 1 fällige Zahlung');
  assert.equal(reminderSubject([entry(), entry()]), 'Eunomia: 2 fällige Zahlungen');
  assert.equal(
    reminderSubject([entry({ stage: 'overdue' }), entry(), entry()]),
    'Eunomia: 1 überfällige Zahlung und 2 fällige Zahlungen',
  );
});

test('a line carries invoice, insured person, payee, amount and timing', () => {
  const { text } = renderReminderMail('Max', [entry()], { today: TODAY });

  assert.match(text, /^Hallo Max,$/m);
  // Intl puts a non-breaking space before the currency sign, hence \s.
  assert.match(
    text,
    /- Rechnung 2026-0042 · Mia Musterfrau · Praxis Dr\. Meier · 128,40\s€ · fällig am 29\.09\.2026 \(in 5 Tagen\)$/m,
  );
});

test('the timing wording distinguishes today, ahead, overdue and undated', () => {
  const render = (overrides: Partial<ReminderEntry>): string =>
    renderReminderMail('Max', [entry(overrides)], { today: TODAY }).text;

  assert.match(render({ transferUntilDate: TODAY }), /fällig heute, 24\.09\.2026/);
  assert.match(render({ transferUntilDate: '2026-09-25' }), /\(in 1 Tag\)/);
  assert.match(
    render({ transferUntilDate: '2026-09-12', stage: 'overdue' }),
    /fällig war der 12\.09\.2026 \(seit 12 Tagen überfällig\)/,
  );
  assert.match(render({ transferUntilDate: null }), /ohne Zahlungsziel erfasst/);
});

test('overdue and due are separate blocks, worst first', () => {
  const { text } = renderReminderMail(
    'Max',
    [entry(), entry({ invoiceNumber: '2026-0001', stage: 'overdue' })],
    { today: TODAY },
  );

  const overdueBlock = text.indexOf('Überfällig:');
  const dueBlock = text.indexOf('Fällig:');
  assert.ok(overdueBlock > 0 && dueBlock > overdueBlock, text);
  assert.ok(text.indexOf('2026-0001') < text.indexOf('2026-0042'));
});

test('a missing payee is named as missing rather than left blank', () => {
  const { text } = renderReminderMail('Max', [entry({ payee: null })], { today: TODAY });
  assert.match(text, /· Empfänger nicht erfasst ·/);
});

test('the link appears only when a base URL is configured', () => {
  assert.ok(!renderReminderMail('Max', [entry()], { today: TODAY }).text.includes('http'));
  const linked = renderReminderMail('Max', [entry()], {
    today: TODAY,
    appUrl: 'https://eunomia.example.com/',
  }).text;
  // The trailing slash must not produce a double one.
  assert.match(linked, /https:\/\/eunomia\.example\.com\/invoices$/m);
});

test('in English the mail counts, dates and words follow the recipient', () => {
  const entries = [
    entry(),
    entry({ invoiceNumber: '2026-0001', stage: 'overdue', transferUntilDate: '2026-09-23' }),
  ];
  const { subject, text } = renderReminderMail('Sam', entries, {
    today: TODAY,
    locale: 'en',
    region: 'en-GB',
  });

  assert.equal(subject, 'Eunomia: 1 overdue payment and 1 payment due');
  assert.match(text, /^Hello Sam,$/m);
  assert.match(text, /^payments are due for the following invoices:$/m);
  assert.match(
    text,
    /- Invoice 2026-0042 · Mia Musterfrau · Praxis Dr\. Meier · €128\.40 · due on 29\/09\/2026 \(in 5 days\)$/m,
  );
  assert.match(text, /was due on 23\/09\/2026 \(overdue for 1 day\)/);
  assert.ok(!/fällig|Rechnung/.test(text), text);
});

test('English text with German formats is a choice of its own', () => {
  const { text } = renderReminderMail('Sam', [entry()], {
    today: TODAY,
    locale: 'en',
    region: 'de-DE',
  });
  assert.match(text, /128,40\s€ · due on 29\.09\.2026/);
});
