import { type PaymentState, calcPaymentState } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleInfo,
  faClock,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

import { todayIso } from '../lib/date-input';
import { i18n } from '../lib/i18n';
import type { InvoiceDto } from './api';

const { t } = i18n.global;

/**
 * The payment-status "traffic light" for an invoice — driven by the money side
 * (has the user paid the facility/agency yet, and how close is the due date),
 * separate from the reimbursement workflowStatus.
 *
 * The rule itself is @eunomia/shared's: the payment reminders decide by the same
 * one, and a mail that disagreed with the light on screen would be a bug nobody
 * could explain. What is left here is how the four states look, and which day
 * counts as today in a browser.
 */

export { DUE_SOON_DAYS, type PaymentState } from '@eunomia/shared';

/** The traffic light of an invoice, as of the reader's own calendar day. */
export function paymentState(
  invoice: Pick<InvoiceDto, 'transferDate' | 'transferUntilDate' | 'directPayment'>,
): PaymentState {
  return calcPaymentState(invoice, todayIso());
}

export interface PaymentDisplay {
  /** Icon whose shape (not only colour) distinguishes the state — WCAG 1.4.1. */
  icon: IconDefinition;
  /** Human-readable state, used for the tooltip and aria-label. */
  label: string;
}

export const PAYMENT_DISPLAY: Record<PaymentState, PaymentDisplay> = {
  paid: {
    icon: faCircleCheck,
    get label() {
      return t('invoices.payment.paid');
    },
  },
  uncritical: {
    icon: faCircleInfo,
    get label() {
      return t('invoices.payment.uncritical');
    },
  },
  due: {
    icon: faClock,
    get label() {
      return t('invoices.payment.due');
    },
  },
  overdue: {
    icon: faTriangleExclamation,
    get label() {
      return t('invoices.payment.overdue');
    },
  },
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
