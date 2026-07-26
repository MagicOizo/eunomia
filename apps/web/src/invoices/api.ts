import { apiFetch } from '../lib/api';
import type { WorkflowStatus } from './status';

export interface InvoiceDto {
  invoiceUID: string;
  invoiceNumber: string;
  invoiceDate: string;
  treatmentDate: string;
  accountUID: string;
  facilityUID: string | null;
  submissionUID: string | null;
  invoiceAmount: number;
  transferUntilDate: string | null;
  transferDate: string | null;
  transferSubject: string | null;
  documentLink: string | null;
  agencyUID: string | null;
  directPayment: number;
  reimbursedTotal: number;
  allocationCount: number;
  workflowStatus: WorkflowStatus;
  /** True while any billing reimbursing this invoice has an unresolved objection. */
  hasOpenObjection: boolean;
}

export interface BillingDto {
  billingUID: string;
  submissionUID: string;
  billingDate: string;
  billingNumber: string;
  documentLink: string | null;
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
  return unwrap(await apiFetch<{ data: InvoiceDto[] }>(`/invoices?accountUID=${accountUID}&year=${year}`));
}

export async function listInvoiceYears(accountUID: string): Promise<number[]> {
  return unwrap(await apiFetch<{ data: number[] }>(`/invoices/years?accountUID=${accountUID}`));
}

export async function createInvoice(body: Record<string, unknown>): Promise<InvoiceDto> {
  return unwrap(await apiFetch<{ data: InvoiceDto }>('/invoices', { method: 'POST', body }));
}

export async function updateInvoice(uid: string, body: Record<string, unknown>): Promise<InvoiceDto> {
  return unwrap(await apiFetch<{ data: InvoiceDto }>(`/invoices/${uid}`, { method: 'PATCH', body }));
}

export async function deleteInvoice(uid: string): Promise<void> {
  await apiFetch(`/invoices/${uid}`, { method: 'DELETE' });
}

export async function createSubmission(body: {
  contractUID: string;
  submittedDate: string;
  invoiceUIDs: string[];
}): Promise<{ submissionUID: string }> {
  return unwrap(await apiFetch<{ data: { submissionUID: string } }>('/submissions', { method: 'POST', body }));
}

export async function listBillings(submissionUID: string): Promise<BillingDto[]> {
  return unwrap(await apiFetch<{ data: BillingDto[] }>(`/billings?submissionUID=${submissionUID}`));
}

/** Enriched service billings for one contract (Leistungsabrechnungen list). */
export async function listContractBillings(contractUID: string): Promise<BillingListDto[]> {
  return unwrap(await apiFetch<{ data: BillingListDto[] }>(`/billings?contractUID=${contractUID}`));
}

export async function createBilling(body: {
  submissionUID: string;
  billingDate: string;
  billingNumber: string;
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
    objectionDate?: string | null;
    objectionResolvedDate?: string | null;
    objectionNote?: string | null;
  },
): Promise<BillingDto> {
  return unwrap(await apiFetch<{ data: BillingDto }>(`/billings/${uid}`, { method: 'PATCH', body }));
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
