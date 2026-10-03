/**
 * When a payment to the facility (or its collection agency) counts as due.
 *
 * One rule for both sides: the payment reminders decide by it whether a mail
 * goes out (apps/api/src/reminders/runner.ts), and the invoice list paints the
 * traffic light by it (apps/web/src/invoices/payment.ts). They used to be twins
 * in two files, and their date arithmetic had already drifted apart — a reminder
 * that disagreed with the light the user sees would be a bug nobody could
 * explain.
 *
 * The rule takes "today" as an argument rather than reading the clock: on the
 * server it is the date in the configured time zone, in the browser the user's
 * local calendar day, and in a test whatever the case is about.
 */

/** Due within this many days (but not yet overdue) counts as "due". */
export const DUE_SOON_DAYS = 10;

/** Only the two states a reminder is about; 'paid' and 'uncritical' say nothing. */
export type ReminderStage = 'due' | 'overdue';

export type PaymentState = 'paid' | 'uncritical' | ReminderStage;

/** The invoice fields the rule looks at — dates as the `YYYY-MM-DD` the API speaks. */
export interface PayableInvoice {
  transferDate: string | null;
  transferUntilDate: string | null;
  directPayment: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `today` until `date` (negative = in the past). Both are
 * `YYYY-MM-DD` calendar days and are compared as such, as UTC timestamps of
 * midnight: no local zone and no daylight saving can shift a due date by a day,
 * whichever side of UTC the reader sits on.
 */
export function daysUntil(date: string, today: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * Derives the payment state, with `today` as a `YYYY-MM-DD` calendar day:
 * - paid: already transferred, or settled directly in cash
 * - overdue: unpaid and the due date has passed
 * - due: unpaid and due within DUE_SOON_DAYS — or no due date recorded
 * - uncritical: unpaid but the due date is still comfortably ahead
 */
export function calcPaymentState(invoice: PayableInvoice, today: string): PaymentState {
  if (invoice.transferDate !== null || invoice.directPayment) return 'paid';
  if (invoice.transferUntilDate === null) return 'due';

  const days = daysUntil(invoice.transferUntilDate, today);
  if (days < 0) return 'overdue';
  if (days < DUE_SOON_DAYS) return 'due';
  return 'uncritical';
}
