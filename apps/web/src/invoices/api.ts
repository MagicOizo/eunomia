import type { BonusForfeitRule } from '../contracts/api';
import { apiFetch } from '../lib/api';
import type { SubmissionStatus, WorkflowStatus } from './status';

/** One submission of an invoice, i.e. the invoice at one policy. */
export interface InvoiceSubmissionDto {
  submissionUID: string;
  contractUID: string;
  contractNumber: string;
  companyName: string;
  /** The policy's rule; presets the "Verwirkt den Bonus" toggle when billing. */
  bonusForfeitRule: BonusForfeitRule;
  submittedDate: string;
  /** Active service billings of the submission; withdrawing is only possible at 0. */
  billingCount: number;
  /** What this policy reimbursed for the invoice. */
  reimbursed: number;
  status: SubmissionStatus;
}

/** A "not reimbursable under this policy" mark. */
export interface InvoiceExclusionDto {
  contractUID: string;
  contractNumber: string;
  companyName: string;
  note: string | null;
}

export interface InvoiceDto {
  invoiceUID: string;
  invoiceNumber: string;
  invoiceDate: string;
  treatmentDate: string;
  accountUID: string;
  facilityUID: string | null;
  invoiceAmount: number;
  transferUntilDate: string | null;
  transferDate: string | null;
  transferSubject: string | null;
  documentLink: string | null;
  agencyUID: string | null;
  directPayment: number;
  /** Marked as billed by hand although the reimbursements do not cover the amount. */
  reimbursementClosed: boolean;
  reimbursedTotal: number;
  allocationCount: number;
  /** Not yet reimbursed amount over all policies. */
  remainingAmount: number;
  workflowStatus: WorkflowStatus;
  submissions: InvoiceSubmissionDto[];
  exclusions: InvoiceExclusionDto[];
  /** True while any billing reimbursing this invoice has an unresolved objection. */
  hasOpenObjection: boolean;
}

export interface BillingDto {
  billingUID: string;
  submissionUID: string;
  billingDate: string;
  billingNumber: string;
  documentLink: string | null;
  /** Whether the billing forfeits the policy's bonus; null follows the policy's rule. */
  forfeitsBonus: boolean | null;
  /** Objection ("Widerspruch") tracking; objectionDate set + resolved unset = open. */
  objectionDate: string | null;
  objectionResolvedDate: string | null;
  objectionNote: string | null;
}

/** A billing enriched for the standalone Leistungsabrechnungen list. */
export interface BillingListDto extends BillingDto {
  accountUID: string;
  contractUID: string;
  personName: string;
  contractNumber: string;
  bonusForfeitRule: BonusForfeitRule;
  /** Sum of the allocations booked against this billing. */
  reimbursedTotal: number;
  invoiceCount: number;
  /** Comma-separated invoice numbers reimbursed through it (null if none yet). */
  invoiceNumbers: string | null;
}

export interface ReimbursementAnalysisDto {
  contractUID: string;
  year: number;
  deductible: number;
  bonus: number;
  /** True while the bonus scale is not modelled yet (Slice 18): `bonus` is then 0. */
  bonusPending: boolean;
  reimbursementCap: number | null;
  invoiceTotal: number;
  alreadyReimbursed: number;
  analysis: {
    reimbursement: number;
    worthSubmitting: boolean;
    cappedOut: boolean;
    breakEvenInvoiceTotal: number | null;
    shortfallToBreakEven: number | null;
  };
}

const unwrap = <T>(res: { data: T }): T => res.data;

export async function listInvoices(accountUID: string, year: number): Promise<InvoiceDto[]> {
  return unwrap(
    await apiFetch<{ data: InvoiceDto[] }>(`/invoices?accountUID=${accountUID}&year=${year}`),
  );
}

/** All invoices of an account (every year) — used to pick allocation targets. */
export async function listAccountInvoices(accountUID: string): Promise<InvoiceDto[]> {
  return unwrap(await apiFetch<{ data: InvoiceDto[] }>(`/invoices?accountUID=${accountUID}`));
}

export interface SubmissionDto {
  submissionUID: string;
  contractUID: string;
  submittedDate: string;
  accountUID: string;
  invoiceUIDs: string[];
}

/** All submissions the user may view (filter by contract client-side). */
export async function listSubmissions(): Promise<SubmissionDto[]> {
  return unwrap(await apiFetch<{ data: SubmissionDto[] }>('/submissions'));
}

export async function listInvoiceYears(accountUID: string): Promise<number[]> {
  return unwrap(await apiFetch<{ data: number[] }>(`/invoices/years?accountUID=${accountUID}`));
}

export async function createInvoice(body: Record<string, unknown>): Promise<InvoiceDto> {
  return unwrap(await apiFetch<{ data: InvoiceDto }>('/invoices', { method: 'POST', body }));
}

export async function updateInvoice(
  uid: string,
  body: Record<string, unknown>,
): Promise<InvoiceDto> {
  return unwrap(
    await apiFetch<{ data: InvoiceDto }>(`/invoices/${uid}`, { method: 'PATCH', body }),
  );
}

export async function deleteInvoice(uid: string): Promise<void> {
  await apiFetch(`/invoices/${uid}`, { method: 'DELETE' });
}

export async function createSubmission(body: {
  contractUID: string;
  submittedDate: string;
  invoiceUIDs: string[];
}): Promise<{ submissionUID: string }> {
  return unwrap(
    await apiFetch<{ data: { submissionUID: string } }>('/submissions', { method: 'POST', body }),
  );
}

/** Withdraws an invoice from a submission that has no service billing yet. */
export async function withdrawSubmission(submissionUID: string, invoiceUID: string): Promise<void> {
  await apiFetch(`/submissions/${submissionUID}/invoices/${invoiceUID}`, { method: 'DELETE' });
}

/** Marks the invoice as not reimbursable under a policy. */
export async function addExclusion(
  invoiceUID: string,
  body: { contractUID: string; note?: string | null },
): Promise<InvoiceDto> {
  return unwrap(
    await apiFetch<{ data: InvoiceDto }>(`/invoices/${invoiceUID}/exclusions`, {
      method: 'POST',
      body,
    }),
  );
}

export async function removeExclusion(invoiceUID: string, contractUID: string): Promise<void> {
  await apiFetch(`/invoices/${invoiceUID}/exclusions/${contractUID}`, { method: 'DELETE' });
}

export async function listBillings(submissionUID: string): Promise<BillingListDto[]> {
  return unwrap(
    await apiFetch<{ data: BillingListDto[] }>(`/billings?submissionUID=${submissionUID}`),
  );
}

/** Enriched service billings for one contract (Leistungsabrechnungen list). */
export async function listContractBillings(contractUID: string): Promise<BillingListDto[]> {
  return unwrap(await apiFetch<{ data: BillingListDto[] }>(`/billings?contractUID=${contractUID}`));
}

export async function createBilling(body: {
  submissionUID: string;
  billingDate: string;
  billingNumber: string;
  documentLink?: string | null;
  forfeitsBonus?: boolean;
}): Promise<BillingDto> {
  return unwrap(await apiFetch<{ data: BillingDto }>('/billings', { method: 'POST', body }));
}

/** Edits a billing's metadata and/or its objection ("Widerspruch") state. */
export async function updateBilling(
  uid: string,
  body: {
    billingNumber?: string;
    billingDate?: string;
    documentLink?: string | null;
    forfeitsBonus?: boolean;
    objectionDate?: string | null;
    objectionResolvedDate?: string | null;
    objectionNote?: string | null;
  },
): Promise<BillingDto> {
  return unwrap(
    await apiFetch<{ data: BillingDto }>(`/billings/${uid}`, { method: 'PATCH', body }),
  );
}

/** Deletes a billing, cascading to its allocations (affected invoices revert). */
export async function deleteBilling(uid: string): Promise<void> {
  await apiFetch(`/billings/${uid}`, { method: 'DELETE' });
}

export async function createAllocation(body: {
  billingUID: string;
  invoiceUID: string;
  reimbursement: number;
  receiptNumber?: string;
}): Promise<void> {
  await apiFetch('/allocations', { method: 'POST', body });
}

export async function reimbursementAnalysis(
  contractUID: string,
  year: number,
): Promise<ReimbursementAnalysisDto> {
  return unwrap(
    await apiFetch<{ data: ReimbursementAnalysisDto }>(
      `/contracts/${contractUID}/reimbursement-analysis?year=${year}`,
    ),
  );
}
