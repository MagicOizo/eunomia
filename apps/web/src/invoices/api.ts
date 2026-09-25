import type { BonusForfeitRule } from '../contracts/api';
import { apiFetch } from '../lib/api';
import type { SubmissionStatus, WorkflowStatus } from './status';

/** What one service billing reimbursed for this invoice. */
export interface InvoiceAllocationDto {
  allocationUID: string;
  billingUID: string;
  billingNumber: string;
  billingDate: string;
  receiptNumber: string | null;
  reimbursement: number;
  /** The billing is under an unresolved objection ("Widerspruch"). */
  objectionOpen: boolean;
}

/** One submission of an invoice, i.e. the invoice at one policy. */
export interface InvoiceSubmissionDto {
  submissionUID: string;
  contractUID: string;
  contractNumber: string;
  companyName: string;
  /** The policy's rule; presets the "Verwirkt den Bonus" toggle when billing. */
  bonusForfeitRule: BonusForfeitRule;
  submittedDate: string;
  /** Billings that reimbursed this invoice here; withdrawing is only possible at 0. */
  billingCount: number;
  /** What this policy reimbursed for the invoice. */
  reimbursed: number;
  status: SubmissionStatus;
  /** The billings of this submission that reimbursed the invoice, oldest first. */
  allocations: InvoiceAllocationDto[];
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
  /** A billing belongs to the policy; which submissions it answers follows from its allocations. */
  contractUID: string;
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
  personName: string;
  contractNumber: string;
  bonusForfeitRule: BonusForfeitRule;
  /** Sum of the allocations booked against this billing. */
  reimbursedTotal: number;
  invoiceCount: number;
  /** Comma-separated invoice numbers reimbursed through it (null if none yet). */
  invoiceNumbers: string | null;
}

/** How a policy's bonus stands in the planned year (see the API's reimbursement-plan.ts). */
export type PlanBonusStatus = 'at-stake' | 'forfeited' | 'paid' | 'none';

export interface PlanPolicyDto {
  contractUID: string;
  contractNumber: string;
  companyName: string;
  contractKind: 'FULL' | 'SUPPLEMENTARY';
  /** False when no terms exist for the year: deductible 0, no cap, 100 % are assumed. */
  hasTerms: boolean;
  deductible: number;
  reimbursementCap: number | null;
  reimbursementRate: number;
  bonusStatus: PlanBonusStatus;
  /** Bonus at stake or received; 0 when forfeited or none. */
  bonusAmount: number;
  /** Claim-free streak a use would break; null unless the bonus is at stake. */
  claimFreeStreak: number | null;
  pendingClaims: number;
  tiersInherited: boolean;
  recommendation: 'use' | 'spare';
  /**
   * What to do now: spare it, submit, wait (a supplementary policy while a
   * spared one before it may still tip) or exhausted (cap reached).
   */
  status: 'spare' | 'submit' | 'wait' | 'exhausted';
  actualReimbursement: number;
  expectedReimbursement: number;
  /** Deductible the year's costs fill (for a spared policy: as if it were used). */
  deductibleUsed: number;
  /** Invoice amounts not excluded at this policy. */
  eligibleCosts: number;
  /** For a spared policy with a bonus at stake: further costs above which using it pays off. */
  worthUsingAbove: number | null;
}

export type PlanInvoicePolicyAction =
  'excluded' | 'answered' | 'submitted' | 'submit' | 'wait' | 'withdraw' | 'none';

export type PlanInvoiceAction =
  'submit' | 'withdraw' | 'wait' | 'hold' | 'done' | 'not-reimbursable';

export interface PlanInvoiceDto {
  invoiceUID: string;
  invoiceNumber: string | null;
  action: PlanInvoiceAction;
  /** In processing order: full policies before supplementary ones. */
  policies: Array<{ contractUID: string; action: PlanInvoicePolicyAction; reimbursement: number }>;
}

export interface PlanStrategyDto {
  usedContractUIDs: string[];
  sparedContractUIDs: string[];
  reimbursements: Record<string, number>;
  bonusTotal: number;
  total: number;
}

/** The reimbursement optimizer's plan for one insured person and treatment year. */
export interface ReimbursementPlanDto {
  accountUID: string;
  year: number;
  invoiceTotal: number;
  /** Lead of the recommended strategy over the next best; null if there is no alternative. */
  advantage: number | null;
  /** Best first; the first one is the recommendation. */
  strategies: PlanStrategyDto[];
  policies: PlanPolicyDto[];
  invoices: PlanInvoiceDto[];
}

const unwrap = <T>(res: { data: T }): T => res.data;

export async function listInvoices(accountUID: string, year: number): Promise<InvoiceDto[]> {
  return unwrap(
    await apiFetch<{ data: InvoiceDto[] }>(`/invoices?accountUID=${accountUID}&year=${year}`),
  );
}

/**
 * Invoices whose number contains `q`, over every insured person the user may
 * see and every treatment year (issues.md 6): the way back to an invoice when
 * only its number is at hand. The API scopes the result to the user's accounts.
 */
export async function searchInvoicesByNumber(q: string, limit = 25): Promise<InvoiceDto[]> {
  const query = new URLSearchParams({ q, limit: String(limit) });
  return unwrap(await apiFetch<{ data: InvoiceDto[] }>(`/invoices?${query.toString()}`));
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

/** The filters of the billings search; every one of them is optional. */
export interface BillingSearchParams {
  contractUID?: string;
  /** Free text over billing number, policy number, person and invoice numbers. */
  q?: string;
  from?: string;
  to?: string;
  /** Only billings that have no reimbursement booked on them yet. */
  unlinked?: boolean;
  minReimbursement?: number;
  maxReimbursement?: number;
  limit?: number;
}

/** Searches service billings server-side (the filter dialog and the list's filter bar). */
export async function searchBillings(params: BillingSearchParams): Promise<BillingListDto[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    query.set(key, String(value));
  }
  return unwrap(await apiFetch<{ data: BillingListDto[] }>(`/billings?${query.toString()}`));
}

export async function createBilling(body: {
  contractUID: string;
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

/** One reimbursement of a billing, booked onto an invoice of its submission. */
export interface AllocationEntry {
  invoiceUID: string;
  reimbursement: number;
  receiptNumber?: string;
}

/**
 * Books the reimbursements of one billing in a single transaction: either all
 * invoices are booked or none is, and the server reports every entry that
 * breaks a rule at once.
 */
export async function createAllocations(
  billingUID: string,
  entries: AllocationEntry[],
): Promise<void> {
  await apiFetch(`/billings/${billingUID}/allocations`, { method: 'POST', body: { entries } });
}

/**
 * Corrects a booked reimbursement without unbooking it: its amount, its
 * receipt number, or both. Which invoice and which billing it belongs to
 * cannot be changed here.
 */
export async function updateAllocation(
  uid: string,
  body: { reimbursement?: number; receiptNumber?: string | null },
): Promise<void> {
  await apiFetch(`/allocations/${uid}`, { method: 'PATCH', body });
}

/** Removes a booked reimbursement; the billing itself stays. */
export async function deleteAllocation(uid: string): Promise<void> {
  await apiFetch(`/allocations/${uid}`, { method: 'DELETE' });
}

export async function reimbursementPlan(
  accountUID: string,
  year: number,
): Promise<ReimbursementPlanDto> {
  return unwrap(
    await apiFetch<{ data: ReimbursementPlanDto }>(
      `/accounts/${accountUID}/reimbursement-plan?year=${year}`,
    ),
  );
}
