import { type ReminderStage, daysUntil } from './payment.js';

/**
 * The text of a payment reminder (see Notes/eunomia-plan.md, Slice 31).
 *
 * Plain text, like the test mail: an HTML part would need a second rendering
 * to keep in step, and there is nothing here that a list of lines cannot say.
 * The whole module is pure, so its test needs neither a database nor a socket.
 */

/** One invoice as it appears in a reminder. */
export interface ReminderEntry {
  invoiceUID: string;
  invoiceNumber: string;
  /** Who the treatment was for — a household has more than one insured person. */
  accountName: string;
  /** Facility, or the collection agency that took the billing over. */
  payee: string | null;
  amount: number;
  transferUntilDate: string | null;
  stage: ReminderStage;
}

export interface ReminderMailOptions {
  /** The run's calendar day, `YYYY-MM-DD`, for the "in n days" wording. */
  today: string;
  /** Base URL of this instance, when one is configured — otherwise no links. */
  appUrl?: string | null;
}

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** `2026-10-01` → `01.10.2026`, without pulling the server's locale into it. */
function germanDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

/** German plural without a library: the two forms this text needs. */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "fällig am 01.10.2026 (in 5 Tagen)" and its overdue and undated variants. */
function timing(entry: ReminderEntry, today: string): string {
  if (entry.transferUntilDate === null) return 'ohne Zahlungsziel erfasst';

  const date = germanDate(entry.transferUntilDate);
  const days = daysUntil(entry.transferUntilDate, today);
  if (days < 0) return `fällig war der ${date} (seit ${count(-days, 'Tag', 'Tagen')} überfällig)`;
  if (days === 0) return `fällig heute, ${date}`;
  return `fällig am ${date} (in ${count(days, 'Tag', 'Tagen')})`;
}

function line(entry: ReminderEntry, today: string): string {
  const parts = [
    `Rechnung ${entry.invoiceNumber}`,
    entry.accountName,
    entry.payee ?? 'Empfänger nicht erfasst',
    money.format(entry.amount),
    timing(entry, today),
  ];
  return `- ${parts.join(' · ')}`;
}

/**
 * The subject names the worse of the two groups first, because that is what a
 * notification list shows: "2 überfällige und 1 fällige Zahlung".
 */
export function reminderSubject(entries: ReminderEntry[]): string {
  const overdue = entries.filter((entry) => entry.stage === 'overdue').length;
  const due = entries.length - overdue;
  const groups = [];
  if (overdue > 0) groups.push(count(overdue, 'überfällige Zahlung', 'überfällige Zahlungen'));
  if (due > 0) groups.push(count(due, 'fällige Zahlung', 'fällige Zahlungen'));
  return `Eunomia: ${groups.join(' und ')}`;
}

/**
 * Renders subject and body for one recipient. Entries arrive already filtered
 * to what this person may see — the renderer does no access checking.
 */
export function renderReminderMail(
  recipientName: string,
  entries: ReminderEntry[],
  options: ReminderMailOptions,
): { subject: string; text: string } {
  const overdue = entries.filter((entry) => entry.stage === 'overdue');
  const due = entries.filter((entry) => entry.stage === 'due');

  const lines = [`Hallo ${recipientName},`, ''];
  lines.push(
    entries.length === 1
      ? 'für eine Rechnung steht eine Zahlung an:'
      : 'für die folgenden Rechnungen steht eine Zahlung an:',
  );

  if (overdue.length > 0) {
    lines.push('', 'Überfällig:', ...overdue.map((entry) => line(entry, options.today)));
  }
  if (due.length > 0) {
    lines.push('', 'Fällig:', ...due.map((entry) => line(entry, options.today)));
  }

  const appUrl = options.appUrl?.replace(/\/+$/, '');
  if (appUrl) lines.push('', `Im Arbeitsbereich öffnen: ${appUrl}/invoices`);

  lines.push(
    '',
    'Diese Nachricht kommt von Ihrer Eunomia-Instanz. Die Erinnerungen lassen sich',
    'in den Systemeinstellungen abschalten.',
  );

  return { subject: reminderSubject(entries), text: lines.join('\n') };
}
