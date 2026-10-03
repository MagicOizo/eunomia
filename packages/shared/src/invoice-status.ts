/**
 * The vocabulary of the invoice status ladder (see Notes/eunomia-plan.md, 2.3
 * "Abgeleiteter Status"). The status itself is never stored — the API derives it
 * from the invoice's submissions, its allocations, the "reimbursement closed"
 * mark and the payment date (domain/invoice-status.ts). What is shared here are
 * the names: the web writes them into its DTOs and keys its badge tables by
 * them, so a sixth rung has to be added in one place, not two.
 */

/** The rungs of the ladder, in the order they are climbed. */
export const WORKFLOW_STATUSES = [
  'offen',
  'eingereicht',
  'teilabgerechnet',
  'abgerechnet',
  'erledigt',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Status of one submission of the invoice (one policy). */
export const SUBMISSION_STATUSES = ['eingereicht', 'abgerechnet'] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * What a status filter of the invoice list may ask for: one of the statuses, or
 * "everything that is not done yet" — the question behind most filtered views
 * ("was steht bei diesem Dienstleister noch offen?"). Leaving the filter out
 * means every status, so there is no 'alle' value here.
 */
export const STATUS_FILTERS = [...WORKFLOW_STATUSES, 'nicht-erledigt'] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];
