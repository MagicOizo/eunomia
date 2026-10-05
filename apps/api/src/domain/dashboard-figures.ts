/**
 * The invoice figures of the start page (issues.md 0.15.0-3), as a pure
 * function over one row per invoice — so the definitions are unit-tested in
 * isolation and dashboard.ts only has to load the rows.
 *
 * Definitions (decided with the author, 2026-10-05):
 *  - Self-borne ("Eigenanteil") is everything not reimbursed: per invoice
 *    `max(0, amount − reimbursed)`, over every invoice — running ones and
 *    "nicht gedeckte" ones included. It is what the household has carried so
 *    far, not a forecast.
 *  - The year series runs by treatment year, like every other year in the app.
 *  - "Open" is two separate questions per insured person: is it still to be
 *    paid (the traffic light of `calcPaymentState`, the rule the reminders use),
 *    and is its reimbursement still under way (derived status offen,
 *    eingereicht or teilabgerechnet). A not-covered invoice is never submitted,
 *    so it is not under way — it would otherwise sit in "offen" forever.
 *
 * All sums run in whole cents; inputs and outputs are euros.
 */

import { calcPaymentState } from '@eunomia/shared';

import { deriveInvoiceStatus } from './invoice-status.js';

export interface DashboardInvoice {
  accountUID: string;
  invoiceDate: string;
  treatmentYear: number;
  invoiceAmount: number;
  /** Sum of the active allocations over every policy. */
  reimbursedTotal: number;
  allocationCount: number;
  submissionCount: number;
  reimbursementClosed: boolean;
  notCovered: boolean;
  transferDate: string | null;
  transferUntilDate: string | null;
  directPayment: boolean;
}

export interface MoneyFigures {
  invoiceCount: number;
  invoiceAmount: number;
  reimbursed: number;
  selfBorne: number;
}

export interface YearFigures extends MoneyFigures {
  year: number;
}

export interface PaymentFigures {
  unpaidCount: number;
  unpaidAmount: number;
  dueCount: number;
  overdueCount: number;
}

export interface WorkflowFigures {
  offen: number;
  eingereicht: number;
  teilabgerechnet: number;
}

export interface AccountFigures {
  payment: PaymentFigures;
  workflow: WorkflowFigures;
}

export interface InvoiceSummary {
  /** The earliest invoice date, or null without any invoice. */
  since: string | null;
  totals: MoneyFigures;
  /** Oldest first. */
  years: YearFigures[];
  accounts: Map<string, AccountFigures>;
}

const toCents = (euros: number): number => Math.round(euros * 100);
const toEuros = (cents: number): number => cents / 100;

interface MoneyCents {
  invoiceCount: number;
  amount: number;
  reimbursed: number;
  selfBorne: number;
}

const emptyMoney = (): MoneyCents => ({ invoiceCount: 0, amount: 0, reimbursed: 0, selfBorne: 0 });

const moneyFigures = (cents: MoneyCents): MoneyFigures => ({
  invoiceCount: cents.invoiceCount,
  invoiceAmount: toEuros(cents.amount),
  reimbursed: toEuros(cents.reimbursed),
  selfBorne: toEuros(cents.selfBorne),
});

/** A person's figures before any invoice is counted. */
export function emptyAccountFigures(): AccountFigures {
  return {
    payment: { unpaidCount: 0, unpaidAmount: 0, dueCount: 0, overdueCount: 0 },
    workflow: { offen: 0, eingereicht: 0, teilabgerechnet: 0 },
  };
}

/** Sums the invoices; `today` is the `YYYY-MM-DD` the payment light is read on. */
export function summarizeInvoices(
  invoices: readonly DashboardInvoice[],
  today: string,
): InvoiceSummary {
  const totals = emptyMoney();
  const years = new Map<number, MoneyCents>();
  const unpaidCents = new Map<string, number>();
  const accounts = new Map<string, AccountFigures>();
  let since: string | null = null;

  for (const invoice of invoices) {
    const amount = toCents(invoice.invoiceAmount);
    const reimbursed = toCents(invoice.reimbursedTotal);
    const selfBorne = Math.max(0, amount - reimbursed);
    let year = years.get(invoice.treatmentYear);
    if (!year) {
      year = emptyMoney();
      years.set(invoice.treatmentYear, year);
    }
    for (const sum of [totals, year]) {
      sum.invoiceCount += 1;
      sum.amount += amount;
      sum.reimbursed += reimbursed;
      sum.selfBorne += selfBorne;
    }
    if (since === null || invoice.invoiceDate < since) since = invoice.invoiceDate;

    let figures = accounts.get(invoice.accountUID);
    if (!figures) {
      figures = emptyAccountFigures();
      accounts.set(invoice.accountUID, figures);
    }

    const payment = calcPaymentState(invoice, today);
    if (payment !== 'paid') {
      figures.payment.unpaidCount += 1;
      unpaidCents.set(invoice.accountUID, (unpaidCents.get(invoice.accountUID) ?? 0) + amount);
      if (payment === 'due') figures.payment.dueCount += 1;
      if (payment === 'overdue') figures.payment.overdueCount += 1;
    }

    if (!invoice.notCovered) {
      const { workflowStatus } = deriveInvoiceStatus(invoice);
      if (workflowStatus !== 'abgerechnet' && workflowStatus !== 'erledigt') {
        figures.workflow[workflowStatus] += 1;
      }
    }
  }

  for (const [accountUID, cents] of unpaidCents) {
    const figures = accounts.get(accountUID);
    if (figures) figures.payment.unpaidAmount = toEuros(cents);
  }

  return {
    since,
    totals: moneyFigures(totals),
    years: [...years.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, cents]) => ({ year, ...moneyFigures(cents) })),
    accounts,
  };
}
