import {
  DEFAULT_FORMAT,
  type FormatRegion,
  type Locale,
  type ReminderStage,
  daysUntil,
  formatDate,
  formatMoney,
} from '@eunomia/shared';

import { type MailCatalog, mailCatalog } from '../mail/catalog.js';

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
  /** The recipient's language and format (mail/catalog.ts); German when left out. */
  locale?: Locale;
  region?: FormatRegion;
}

/** Catalogue and formats of one mail, resolved once per render. */
interface Wording {
  text: MailCatalog['reminder'];
  region: FormatRegion;
}

/** "fällig am 01.10.2026 (in 5 Tagen)" and its overdue and undated variants. */
function timing(entry: ReminderEntry, today: string, { text, region }: Wording): string {
  if (entry.transferUntilDate === null) return text.undated;

  const date = formatDate(entry.transferUntilDate, region);
  const days = daysUntil(entry.transferUntilDate, today);
  if (days < 0) return text.overdueSince(date, -days);
  if (days === 0) return text.dueToday(date);
  return text.dueIn(date, days);
}

function line(entry: ReminderEntry, today: string, wording: Wording): string {
  const parts = [
    wording.text.invoice(entry.invoiceNumber),
    entry.accountName,
    entry.payee ?? wording.text.noPayee,
    formatMoney(entry.amount, wording.region),
    timing(entry, today, wording),
  ];
  return `- ${parts.join(' · ')}`;
}

/**
 * The subject names the worse of the two groups first, because that is what a
 * notification list shows: "2 überfällige und 1 fällige Zahlung".
 */
export function reminderSubject(entries: ReminderEntry[], locale: Locale = 'de'): string {
  const overdue = entries.filter((entry) => entry.stage === 'overdue').length;
  return mailCatalog(locale).reminder.subject(overdue, entries.length - overdue);
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
  const locale = options.locale ?? 'de';
  const wording: Wording = {
    text: mailCatalog(locale).reminder,
    region: options.region ?? DEFAULT_FORMAT[locale],
  };
  const { text } = wording;
  const overdue = entries.filter((entry) => entry.stage === 'overdue');
  const due = entries.filter((entry) => entry.stage === 'due');

  const lines = [text.greeting(recipientName), '', text.lead(entries.length)];

  if (overdue.length > 0) {
    lines.push(
      '',
      text.overdueHeading,
      ...overdue.map((entry) => line(entry, options.today, wording)),
    );
  }
  if (due.length > 0) {
    lines.push('', text.dueHeading, ...due.map((entry) => line(entry, options.today, wording)));
  }

  const appUrl = options.appUrl?.replace(/\/+$/, '');
  if (appUrl) lines.push('', text.openWorkspace(`${appUrl}/invoices`));

  lines.push('', ...text.footer);

  return { subject: reminderSubject(entries, locale), text: lines.join('\n') };
}
