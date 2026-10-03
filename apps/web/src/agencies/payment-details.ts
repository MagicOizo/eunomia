import { defaultPaymentDetail } from '@eunomia/shared';

import { iban } from '../lib/format';
import type { AgencyPaymentDetailDto } from './api';

/**
 * The payment details of a collection agency — IBAN, BIC, beneficiary and note:
 * several at once, in the order they were recorded (see Notes/eunomia-plan.md,
 * Slice 44).
 *
 * They are called payment details rather than accounts because `account` in this
 * codebase is the insured person (§2.8); the API fields still carry the older
 * word (`agencyAccountUID`, and the array is `accounts`).
 *
 * Until Slice 44 they were a history and a rule said which one applied.
 * Production said otherwise — an agency names three on one bill and only the
 * second of them on the next — so the invoice names its own. What is left here is
 * how to pick one out and how to write one down.
 */

/**
 * Which set to suggest is the one rule both sides apply — the create form here
 * and the flattened agency row in the API — so it lives in @eunomia/shared and is
 * handed on from here, next to the pickers that use it.
 */
export { defaultPaymentDetail };

/** The payment details with the given UID, or null — for an invoice naming one. */
export function paymentDetailByUID<T extends { agencyAccountUID: string }>(
  details: T[],
  uid: string | null,
): T | null {
  if (uid === null) return null;
  return details.find((detail) => detail.agencyAccountUID === uid) ?? null;
}

/**
 * The payment details of an invoice: the ones it names, and while it names none
 * (an invoice from before Slice 44, or one entered elsewhere) the agency's first.
 */
export function invoicePaymentDetail<T extends { agencyAccountUID: string }>(
  details: T[],
  uid: string | null,
): T | null {
  return paymentDetailByUID(details, uid) ?? defaultPaymentDetail(details);
}

/**
 * What identifies one set in a picker or a list: its IBAN, grouped in fours so it
 * reads as one and breaks where it may. What is stored and sent stays compact —
 * this is the printed form.
 */
export function paymentDetailLabel(detail: Pick<AgencyPaymentDetailDto, 'bankAccount'>): string {
  return iban(detail.bankAccount);
}

/**
 * The secondary line in a picker — what tells two IBANs of the same agency
 * apart: who the money is addressed to, and what the note says.
 */
export function paymentDetailHint(
  detail: Pick<AgencyPaymentDetailDto, 'recipientName' | 'note'>,
): string | undefined {
  const parts = [detail.recipientName, detail.note].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? undefined : parts.join(' · ');
}
