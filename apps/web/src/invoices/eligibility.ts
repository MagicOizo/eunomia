import type { SelectOption } from '../components/resource/EuSelectField.vue';
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

/** The stretch of time a policy was in force; an open end is `null`. */
export interface ContractPeriod {
  contractBegin: string;
  contractEnd: string | null;
}

/** A policy as the pickers take it: the option plus the dates it ran between. */
export type ContractOption = SelectOption & ContractPeriod;

/** The span a selection of invoices covers, earliest to latest treatment. */
export interface TreatmentPeriod {
  from: string;
  to: string;
}

/**
 * The treatment span of a selection — what a policy has to cover to be the
 * right one. Null for an empty selection, which rules nothing out.
 */
export function treatmentPeriod(
  invoices: Pick<InvoiceDto, 'treatmentDate'>[],
): TreatmentPeriod | null {
  if (invoices.length === 0) return null;
  const dates = invoices.map((invoice) => invoice.treatmentDate);
  return {
    from: dates.reduce((a, b) => (a < b ? a : b)),
    to: dates.reduce((a, b) => (a > b ? a : b)),
  };
}

/**
 * Policies that ran over the whole treatment span. ISO dates compare as
 * strings, the same way the server's history checks do. Covering the *whole*
 * span is deliberate: a selection straddling a change of policy has no single
 * right answer, and the dialog's switch is there to say so.
 *
 * Unlike `submittableContracts` this is a suggestion, not a rule — the API
 * accepts a submission outside the policy's term, because an insurer does take
 * a treatment from before the contract began.
 */
export function contractsCoveringPeriod<C extends ContractPeriod>(
  contracts: C[],
  period: TreatmentPeriod | null,
): C[] {
  if (period === null) return contracts;
  return contracts.filter(
    (c) => c.contractBegin <= period.from && (c.contractEnd === null || c.contractEnd >= period.to),
  );
}
