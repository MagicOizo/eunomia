import { apiData } from '../lib/api';
import type { PlanPolicyDto } from '../invoices/api';

/**
 * The figures of the start page (issues.md 0.15.0-3), as `GET /dashboard`
 * answers them (the API's domain/dashboard.ts and dashboard-figures.ts).
 * Amounts are euros as numbers; every block is filled under its own
 * permission, so a block the caller may not see comes as zeros or empty.
 */

export interface DashboardMoneyDto {
  invoiceCount: number;
  invoiceAmount: number;
  reimbursed: number;
  /** Everything not reimbursed, per invoice never negative. */
  selfBorne: number;
}

export interface DashboardTotalsDto extends DashboardMoneyDto {
  bonusPaid: number;
  accountCount: number;
  /** Policies running today. */
  contractCount: number;
}

/** One treatment year; a year with a paid bonus but no invoice is included. */
export interface DashboardYearDto extends DashboardMoneyDto {
  year: number;
  bonusPaid: number;
}

/** A policy running in the current year, as the reimbursement plan sees it. */
export type DashboardPolicyDto = Pick<
  PlanPolicyDto,
  | 'contractUID'
  | 'contractNumber'
  | 'companyName'
  | 'contractKind'
  | 'hasTerms'
  | 'deductible'
  | 'deductibleUsed'
  | 'bonusStatus'
  | 'bonusAmount'
  | 'pendingClaims'
  | 'tiersInherited'
  | 'recommendation'
  | 'status'
> & {
  deductibleLeft: number;
};

export interface DashboardAccountDto {
  accountUID: string;
  firstname: string;
  surname: string | null;
  /** Still to be paid, by the traffic light of the payment reminders. */
  payment: { unpaidCount: number; unpaidAmount: number; dueCount: number; overdueCount: number };
  /** Reimbursement still under way, by derived status. */
  workflow: { offen: number; eingereicht: number; teilabgerechnet: number };
  year: number;
  policies: DashboardPolicyDto[];
}

export interface DashboardDto {
  /** The earliest invoice date, or null without any invoice. */
  since: string | null;
  totals: DashboardTotalsDto;
  /** Oldest first. */
  years: DashboardYearDto[];
  accounts: DashboardAccountDto[];
}

export async function loadDashboard(): Promise<DashboardDto> {
  return apiData<DashboardDto>('/dashboard');
}
