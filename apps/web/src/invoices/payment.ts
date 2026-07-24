import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleInfo,
  faClock,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

import type { InvoiceDto } from './api';

/**
 * The payment-status "traffic light" for an invoice — driven by the money side
 * (has the user paid the facility/agency yet, and how close is the due date),
 * separate from the reimbursement workflowStatus. Mirrors the reference app's
 * calcPaymentDue (rechnungs-verwaltung): a paid invoice is done; otherwise the
 * due date drives the urgency, and a missing due date counts as "due" so it is
 * never silently ignored.
 */
export type PaymentState = 'paid' | 'uncritical' | 'due' | 'overdue';

/** Due within this many days (but not yet overdue) counts as "due". */
export const DUE_SOON_DAYS = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight of the given date in local time, so comparisons are whole-day based. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days from `today` until `date` (negative = in the past). */
function daysUntil(date: string, today: Date): number {
  return Math.round((startOfDay(new Date(date)) - startOfDay(today)) / MS_PER_DAY);
}

/**
 * Derives the payment state. `today` is injectable for testing.
 * - paid: already transferred, or settled directly in cash
 * - overdue: unpaid and the due date has passed
 * - due: unpaid and due within DUE_SOON_DAYS — or no due date recorded
 * - uncritical: unpaid but the due date is still comfortably ahead
 */
export function calcPaymentState(
  invoice: Pick<InvoiceDto, 'transferDate' | 'transferUntilDate' | 'directPayment'>,
  today: Date = new Date(),
): PaymentState {
  if (invoice.transferDate !== null || invoice.directPayment === 1) return 'paid';
  if (invoice.transferUntilDate === null) return 'due';

  const days = daysUntil(invoice.transferUntilDate, today);
  if (days < 0) return 'overdue';
  if (days < DUE_SOON_DAYS) return 'due';
  return 'uncritical';
}

export interface PaymentDisplay {
  /** Icon whose shape (not only colour) distinguishes the state — WCAG 1.4.1. */
  icon: IconDefinition;
  /** Human-readable state, used for the tooltip and aria-label. */
  label: string;
}

export const PAYMENT_DISPLAY: Record<PaymentState, PaymentDisplay> = {
  paid: { icon: faCircleCheck, label: 'Bereits bezahlt' },
  uncritical: { icon: faCircleInfo, label: 'Noch nicht fällig' },
  due: { icon: faClock, label: 'Zahlung fällig' },
  overdue: { icon: faTriangleExclamation, label: 'Zahlung überfällig' },
};

/**
 * The design-token CSS variable carrying each state's colour. Reuses the
 * AA-compliant invoice-status foreground scale (green/blue/amber/red), so the
 * traffic light shares its palette with the lifecycle badges. Bind as
 * `color: var(<value>)` — one source of truth for the trigger icon and popover.
 */
export const PAYMENT_COLOR_VAR: Record<PaymentState, string> = {
  paid: '--eu-color-status-done-fg',
  uncritical: '--eu-color-status-billed-fg',
  due: '--eu-color-status-submitted-fg',
  overdue: '--eu-color-status-open-fg',
};
