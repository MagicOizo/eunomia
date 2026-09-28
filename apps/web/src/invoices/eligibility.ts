import type { SelectOption } from '../components/resource/EuSelectField.vue';
import type { InvoiceDto, InvoiceSubmissionDto } from './api';

/** The invoice fields that decide where it can still go. */
type InvoiceRouting = Pick<
  InvoiceDto,
  'workflowStatus' | 'reimbursementClosed' | 'notCovered' | 'submissions' | 'exclusions'
>;

/**
 * Policies the invoice can still be submitted to: an invoice goes to each
 * policy at most once and never to one it is marked as not reimbursable
 * under. A closed ("als abgerechnet markiert") or fully reimbursed invoice
 * goes nowhere any more, and one marked as not covered by the insurance goes
 * nowhere at all (Slice 42). Mirrors the server-side checks, so the dialog
 * never offers a choice the API would reject.
 */
export function submittableContracts<C extends { value: string }>(
  invoice: InvoiceRouting,
  contracts: C[],
): C[] {
  if (invoice.notCovered) return [];
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

/** A policy as the booking dialog needs it: what it is called and its bonus rule. */
export type CommonPolicy = Pick<
  InvoiceSubmissionDto,
  'contractUID' | 'contractNumber' | 'companyName' | 'bonusForfeitRule'
>;

/** How a policy is named wherever one is shown or chosen. */
export function policyLabel(policy: Pick<CommonPolicy, 'contractNumber' | 'companyName'>): string {
  return `${policy.contractNumber} · ${policy.companyName}`;
}

/**
 * Policies every one of the invoices is submitted to — the choice for booking
 * one Leistungsabrechnung over several invoices at once. The policy is what
 * decides, not the submission: a billing belongs to the policy, and one letter
 * of the insurer regularly answers invoices handed in on different days (Slice
 * 37). A selection spread over different policies has nothing in common and
 * nothing to offer. An invoice marked as billed is out: its reimbursement is
 * closed. Mirrors the server-side checks of `POST /billings/:uid/allocations`.
 */
export function commonPolicies(
  invoices: Pick<InvoiceDto, 'submissions' | 'reimbursementClosed'>[],
): CommonPolicy[] {
  if (invoices.length === 0) return [];
  if (invoices.some((invoice) => invoice.reimbursementClosed)) return [];
  const [first, ...rest] = invoices;
  const policies: CommonPolicy[] = [];
  for (const { contractUID, contractNumber, companyName, bonusForfeitRule } of first.submissions) {
    if (policies.some((p) => p.contractUID === contractUID)) continue;
    const everywhere = rest.every((invoice) =>
      invoice.submissions.some((s) => s.contractUID === contractUID),
    );
    if (everywhere) policies.push({ contractUID, contractNumber, companyName, bonusForfeitRule });
  }
  return policies;
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
 *
 * Over *every* treatment day, not just the leading one (Slice 41): an invoice
 * billing three appointments ends on its last, and judging the policy by the
 * first would hand the submit dialog too short a span.
 */
export function treatmentPeriod(
  invoices: Pick<InvoiceDto, 'treatmentDates'>[],
): TreatmentPeriod | null {
  const dates = invoices.flatMap((invoice) => invoice.treatmentDates);
  if (dates.length === 0) return null;
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
