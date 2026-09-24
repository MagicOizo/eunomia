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
