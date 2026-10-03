/**
 * The gap between what an invoice cost and what came back (issues.md 0.12.0-6):
 * how the reimbursement column says that a tariff excess or a deductible ate
 * into it. Kept out of the view so the wording and the rule stay in one place.
 *
 * Two stages, decided by the author (2026-09-28):
 *
 *  - `short`, once the case is closed. "Abgerechnet"/"Erledigt" with something
 *    left over means the invoice was marked as billed by hand although the
 *    reimbursements do not cover it — what remains is borne by the insured
 *    person and will not change any more.
 *  - `pending`, while it is still running. "Teilabgerechnet" is short of the
 *    amount too, but a supplementary policy can still answer — that is exactly
 *    what the optimizer proposes there, so it would cry wolf.
 *
 * "Offen" and "Eingereicht" stay plain: nothing has been booked yet, and a zero
 * that nobody has answered is no news. An invoice marked as not covered is
 * "offen" and therefore falls outside this by itself.
 */

import { germanMoney } from '../lib/format';
import type { InvoiceDto } from './api';

export interface ReimbursementGap {
  tone: 'short' | 'pending';
  /** The sentence for the tooltip and for a screen reader — colour says nothing on its own. */
  label: string;
}

const CENTS = (euros: number): number => Math.round(euros * 100);

export function reimbursementGap(
  invoice: Pick<InvoiceDto, 'workflowStatus' | 'remainingAmount'>,
): ReimbursementGap | null {
  if (CENTS(invoice.remainingAmount) <= 0) return null;
  switch (invoice.workflowStatus) {
    case 'abgerechnet':
    case 'erledigt':
      return {
        tone: 'short',
        label: `Nicht vollständig erstattet – Eigenanteil ${germanMoney(invoice.remainingAmount)}`,
      };
    case 'teilabgerechnet':
      return {
        tone: 'pending',
        label: `Noch nicht vollständig erstattet – offen ${germanMoney(invoice.remainingAmount)}`,
      };
    default:
      return null;
  }
}
