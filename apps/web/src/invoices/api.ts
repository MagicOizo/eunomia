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

export async function createBilling(body: {
  submissionUID: string;
  billingDate: string;
  billingNumber: string;
}): Promise<BillingDto> {
  return unwrap(await apiFetch<{ data: BillingDto }>('/billings', { method: 'POST', body }));
}

/** Files or resolves an objection ("Widerspruch") on a billing (or clears fields with null). */
export async function updateBilling(
  uid: string,
  body: {
    objectionDate?: string | null;
    objectionResolvedDate?: string | null;
    objectionNote?: string | null;
  },
): Promise<BillingDto> {
  return unwrap(await apiFetch<{ data: BillingDto }>(`/billings/${uid}`, { method: 'PATCH', body }));
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
