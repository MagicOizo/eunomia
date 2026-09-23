import type { InvoiceDto, InvoiceSubmissionDto } from './api';

/** The invoice fields that decide where it can still go. */
type InvoiceRouting = Pick<
  InvoiceDto,
  'workflowStatus' | 'reimbursementClosed' | 'submissions' | 'exclusions'
>;

/**
 * Policies the invoice can still be submitted to: an invoice goes to each
 * policy at most once and never to one it is marked as not reimbursable
 * under. A closed ("als abgerechnet markiert") or fully reimbursed invoice
 * goes nowhere any more. Mirrors the server-side checks, so the dialog never
 * offers a choice the API would reject.
 */
export function submittableContracts<C extends { value: string }>(
  invoice: InvoiceRouting,
  contracts: C[],
): C[] {
  if (invoice.reimbursementClosed) return [];
  if (invoice.workflowStatus === 'abgerechnet' || invoice.workflowStatus === 'erledigt') return [];
  const blocked = new Set([
    ...invoice.submissions.map((s) => s.contractUID),
    ...invoice.exclusions.map((x) => x.contractUID),
  ]);
  return contracts.filter((c) => !blocked.has(c.value));
}

/** Policies every one of the invoices can go to — the choice for a bulk submission. */
export function commonSubmittableContracts<C extends { value: string }>(
  invoices: InvoiceRouting[],
  contracts: C[],
): C[] {
  return invoices.reduce((common, invoice) => submittableContracts(invoice, common), contracts);
}

/** Submissions still waiting for a reimbursement for this invoice. */
export function unbilledSubmissions(
  invoice: Pick<InvoiceDto, 'submissions'>,
): InvoiceSubmissionDto[] {
  return invoice.submissions.filter((s) => s.status === 'eingereicht');
}

/**
 * Submissions every one of the invoices belongs to — the choice for booking
 * one Leistungsabrechnung over several invoices at once. A billing can only
 * reimburse invoices of its own submission, so a mixed selection has nothing
 * in common and nothing to offer. An invoice marked as billed is out: its
 * reimbursement is closed. Mirrors the server-side checks of
 * `POST /billings/:uid/allocations`.
 */
export function commonSubmissions(
  invoices: Pick<InvoiceDto, 'submissions' | 'reimbursementClosed'>[],
): InvoiceSubmissionDto[] {
  if (invoices.length === 0) return [];
  if (invoices.some((invoice) => invoice.reimbursementClosed)) return [];
  const [first, ...rest] = invoices;
  return first.submissions.filter((submission) =>
    rest.every((invoice) =>
      invoice.submissions.some((s) => s.submissionUID === submission.submissionUID),
    ),
  );
}
