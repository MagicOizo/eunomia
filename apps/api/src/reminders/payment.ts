/**
 * When a payment to the facility (or its collection agency) counts as due.
 *
 * This is the server-side twin of apps/web/src/invoices/payment.ts, which
 * drives the traffic light in the invoice list. The rule and the threshold are
 * deliberately the same in both places: a reminder that disagreed with the
 * light the user sees would be a bug nobody could explain. The only real home
 * for it would be a package both apps import; packages/shared-types is still
 * an empty placeholder, and setting that up (build order, Vite alias, image)
 * belongs in its own slice — see the backlog. Change one, change the other.
 */

/** Due within this many days (but not yet overdue) counts as "due". */
export const DUE_SOON_DAYS = 10;

/** Only the two states a reminder is about; 'paid' and 'uncritical' say nothing. */
export type ReminderStage = 'due' | 'overdue';

export type PaymentState = 'paid' | 'uncritical' | ReminderStage;

/** The invoice fields the rule looks at — dates as the `YYYY-MM-DD` the driver returns. */
export interface PayableInvoice {
  transferDate: string | null;
  transferUntilDate: string | null;
  directPayment: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `today` until `date` (negative = in the past). Both are
 * `YYYY-MM-DD` calendar days, compared as such: the driver hands dates back as
 * strings (`dateStrings`, see db/pool.ts), and the run's "today" is the date in
 * the configured zone — so neither the server's zone nor daylight saving can
 * shift a due date by one day.
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
  if (invoice.transferDate !== null || invoice.directPayment === 1) return 'paid';
  if (invoice.transferUntilDate === null) return 'due';

  const days = daysUntil(invoice.transferUntilDate, today);
  if (days < 0) return 'overdue';
  if (days < DUE_SOON_DAYS) return 'due';
  return 'uncritical';
}
