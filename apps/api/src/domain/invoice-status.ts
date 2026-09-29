/**
 * Derived invoice status for the multi-submission model (see
 * Notes/eunomia-plan.md, 2.3 "Abgeleiteter Status" / Slice 17). Never stored:
 * always computed from the invoice's submissions, the reimbursements
 * allocated to it across all policies, the "reimbursement closed" mark and
 * the payment date.
 */

export type WorkflowStatus =
  'offen' | 'eingereicht' | 'teilabgerechnet' | 'abgerechnet' | 'erledigt';

/** Status of one submission of the invoice (one policy). */
export type SubmissionStatus = 'eingereicht' | 'abgerechnet';

export interface InvoiceStatusInput {
  invoiceAmount: number;
  /** Sum of all active allocations of the invoice, over every policy. */
  reimbursedTotal: number;
  allocationCount: number;
  submissionCount: number;
  reimbursementClosed: boolean;
  transferDate: string | null;
}

export interface InvoiceStatus {
  workflowStatus: WorkflowStatus;
  /** Not yet reimbursed amount, the candidate for a further policy; never negative. */
  remainingAmount: number;
}

const toCents = (euros: number): number => Math.round(euros * 100);

/**
 * Status ladder:
 *  - offen: not submitted anywhere.
 *  - eingereicht: submitted, no reimbursement allocated yet.
 *  - teilabgerechnet: reimbursements allocated but below the invoice amount,
 *    and not closed by hand — regardless of payment.
 *  - abgerechnet: fully reimbursed, or closed by hand ("als abgerechnet
 *    markiert", e.g. the remainder is a deductible nobody pays), not yet paid.
 *  - erledigt: like abgerechnet, and paid.
 *
 * An allocation of 0 € still counts as "billed": the insurer answered, it
 * just reimbursed nothing, so the invoice is teilabgerechnet, not eingereicht.
 * Amounts are compared in cents to avoid floating-point drift.
 */
export function deriveInvoiceStatus(input: InvoiceStatusInput): InvoiceStatus {
  const remainingCents = Math.max(0, toCents(input.invoiceAmount) - toCents(input.reimbursedTotal));
  const remainingAmount = remainingCents / 100;

  if (input.submissionCount === 0) return { workflowStatus: 'offen', remainingAmount };

  const fullyReimbursed = input.allocationCount > 0 && remainingCents === 0;
  if (fullyReimbursed || input.reimbursementClosed) {
    return {
      workflowStatus: input.transferDate === null ? 'abgerechnet' : 'erledigt',
      remainingAmount,
    };
  }
  return {
    workflowStatus: input.allocationCount > 0 ? 'teilabgerechnet' : 'eingereicht',
    remainingAmount,
  };
}

/** A submission counts as billed once any reimbursement was allocated to the invoice through it. */
export function deriveSubmissionStatus(allocationCount: number): SubmissionStatus {
  return allocationCount > 0 ? 'abgerechnet' : 'eingereicht';
}

/**
 * What a status filter of the invoice list may ask for: one of the statuses, or
 * "everything that is not done yet" — the question behind most filtered views
 * ("was steht bei diesem Dienstleister noch offen?"). Leaving the filter out
 * means every status, so there is no 'alle' value here.
 */
export const STATUS_FILTERS = [
  'offen',
  'eingereicht',
  'teilabgerechnet',
  'abgerechnet',
  'erledigt',
  'nicht-erledigt',
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Whether a derived status passes a status filter. The status is never stored
 * (see above), so the invoice list can only apply this once it has computed it
 * — there is no column to put in a WHERE clause.
 */
export function matchesStatus(status: WorkflowStatus, filter: StatusFilter): boolean {
  return filter === 'nicht-erledigt' ? status !== 'erledigt' : status === filter;
}
