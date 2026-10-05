import { PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { accountFilter, getAccessibleAccounts } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import type { Filter } from '../crud/repository.js';
import { zonedNow } from '../reminders/schedule.js';
import { getPublicSettings } from '../settings/repository.js';
import {
  type DashboardInvoice,
  type YearFigures,
  emptyAccountFigures,
  summarizeInvoices,
} from './dashboard-figures.js';
import { loadReimbursementPlan } from './reimbursement-plan.js';

/**
 * The calendar day the start page is read on: in the zone the payment
 * reminders run in, so the light on the start page and the reminder mail
 * agree about what is overdue.
 */
async function today(pool: Pool): Promise<string> {
  const settings = await getPublicSettings(pool);
  const zone = settings.find((setting) => setting.key === 'reminders.timeZone')?.value;
  return zonedNow(new Date(), String(zone)).date;
}

/** One row per invoice the caller may see, with what its status is derived from. */
async function loadInvoices(pool: Pool, scope: Filter): Promise<DashboardInvoice[]> {
  const rows = await pool.query<
    Array<{
      accountUID: string;
      invoiceDate: string;
      treatmentYear: number;
      invoiceAmount: number;
      reimbursedTotal: number;
      allocationCount: number;
      submissionCount: number;
      reimbursementClosed: number;
      notCovered: number;
      transferDate: string | null;
      transferUntilDate: string | null;
      directPayment: number;
    }>
  >(
    `SELECT i.accountUID, i.invoiceDate, YEAR(i.treatmentDate) AS treatmentYear, i.invoiceAmount,
            COALESCE(r.reimbursedTotal, 0) AS reimbursedTotal,
            COALESCE(r.allocationCount, 0) AS allocationCount,
            COALESCE(s.submissionCount, 0) AS submissionCount,
            i.reimbursementClosed, i.notCovered, i.transferDate, i.transferUntilDate,
            i.directPayment
       FROM Invoices i
       LEFT JOIN (SELECT a.invoiceUID, SUM(a.reimbursement) AS reimbursedTotal,
                         COUNT(*) AS allocationCount
                    FROM Allocations a
                    JOIN ServiceBillings b ON b.billingUID = a.billingUID AND b.billingStatus <> -1
                   WHERE a.allocationStatus <> -1
                   GROUP BY a.invoiceUID) r ON r.invoiceUID = i.invoiceUID
       LEFT JOIN (SELECT si.invoiceUID, COUNT(*) AS submissionCount
                    FROM SubmissionInvoices si
                    JOIN Submissions s
                      ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
                   GROUP BY si.invoiceUID) s ON s.invoiceUID = i.invoiceUID
      WHERE i.invoiceStatus <> -1 AND ${scope.clause}`,
    scope.params,
  );
  return rows.map((row) => ({
    ...row,
    treatmentYear: Number(row.treatmentYear),
    reimbursedTotal: Number(row.reimbursedTotal),
    allocationCount: Number(row.allocationCount),
    submissionCount: Number(row.submissionCount),
    reimbursementClosed: Boolean(row.reimbursementClosed),
    notCovered: Boolean(row.notCovered),
    directPayment: Boolean(row.directPayment),
  }));
}

/** The bonus actually paid per bonus year, as the insurers' letters recorded it. */
async function loadBonusPaid(pool: Pool, scope: Filter): Promise<Map<number, number>> {
  const rows = await pool.query<Array<{ year: number; bonusPaid: number }>>(
    `SELECT cy.year, SUM(cy.actualBonus) AS bonusPaid
       FROM ContractYears cy
       JOIN Contracts c ON c.contractUID = cy.contractUID AND c.contractStatus <> -1
      WHERE cy.actualBonus IS NOT NULL AND ${scope.clause}
      GROUP BY cy.year`,
    scope.params,
  );
  return new Map(rows.map((row) => [Number(row.year), Number(row.bonusPaid)]));
}

async function count(pool: Pool, sql: string, params: unknown[]): Promise<number> {
  const [row] = await pool.query<Array<{ n: number }>>(sql, params);
  return Number(row?.n ?? 0);
}

/**
 * GET /dashboard — the figures of the start page (issues.md 0.15.0-3): totals
 * since the first invoice, the same per treatment year, and per insured person
 * what is open and how the running year stands at each policy.
 *
 * Every figure is read under the permission of the way it would otherwise be
 * reached (I-2): invoice figures under VIEW_INVOICES, the bonus and the policy
 * count under VIEW_CONTRACTS, the person count under VIEW_ACCOUNTS. A person's
 * policies need both VIEW_INVOICES and VIEW_CONTRACTS on them — the terms are
 * contract data, the same line the export draws. Without any of it the start
 * page still loads: zeros and empty lists, never a 403.
 */
export function createDashboardRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (_req, res) => {
    const { userId } = getAuthUser(res);
    const day = await today(pool);
    const currentYear = Number(day.slice(0, 4));

    const invoiceScope = await accountFilter(
      pool,
      userId,
      PERMISSIONS.VIEW_INVOICES,
      'i.accountUID',
    );
    const contractScope = await accountFilter(
      pool,
      userId,
      PERMISSIONS.VIEW_CONTRACTS,
      'c.accountUID',
    );
    const personScope = await accountFilter(
      pool,
      userId,
      PERMISSIONS.VIEW_ACCOUNTS,
      'a.accountUID',
    );

    const summary = summarizeInvoices(
      invoiceScope === null ? [] : await loadInvoices(pool, invoiceScope),
      day,
    );
    const bonusPaid =
      contractScope === null ? new Map<number, number>() : await loadBonusPaid(pool, contractScope);

    // A year with a recorded bonus but no invoice still belongs in the series.
    const years = new Map<number, YearFigures & { bonusPaid: number }>(
      summary.years.map((year) => [year.year, { ...year, bonusPaid: 0 }]),
    );
    for (const [year, amount] of bonusPaid) {
      years.set(year, {
        ...(years.get(year) ?? {
          year,
          invoiceCount: 0,
          invoiceAmount: 0,
          reimbursed: 0,
          selfBorne: 0,
        }),
        bonusPaid: amount,
      });
    }

    const contractCount =
      contractScope === null
        ? 0
        : await count(
            pool,
            `SELECT COUNT(*) AS n FROM Contracts c
              WHERE c.contractStatus <> -1 AND c.contractBegin <= ?
                AND (c.contractEnd IS NULL OR c.contractEnd >= ?) AND ${contractScope.clause}`,
            [day, day, ...contractScope.params],
          );
    const accountCount =
      personScope === null
        ? 0
        : await count(
            pool,
            `SELECT COUNT(*) AS n FROM Accounts a
              WHERE a.accountStatus <> -1 AND ${personScope.clause}`,
            personScope.params,
          );

    // The persons whose invoices are counted above, by the same permission.
    const peopleScope = await accountFilter(
      pool,
      userId,
      PERMISSIONS.VIEW_INVOICES,
      'a.accountUID',
    );
    const people =
      peopleScope === null
        ? []
        : await pool.query<
            Array<{ accountUID: string; firstname: string; surname: string | null }>
          >(
            `SELECT a.accountUID, a.firstname, a.surname FROM Accounts a
              WHERE a.accountStatus <> -1 AND ${peopleScope.clause}
              ORDER BY a.firstname, a.surname, a.accountUID`,
            peopleScope.params,
          );
    const contractAccess = await getAccessibleAccounts(pool, userId, PERMISSIONS.VIEW_CONTRACTS);
    const accounts = [];
    for (const person of people) {
      const policies =
        contractAccess.all || contractAccess.accountUIDs.includes(person.accountUID)
          ? (await loadReimbursementPlan(pool, person.accountUID, currentYear, currentYear))
              .policies
          : [];
      accounts.push({
        ...person,
        ...(summary.accounts.get(person.accountUID) ?? emptyAccountFigures()),
        year: currentYear,
        policies: policies.map((policy) => ({
          contractUID: policy.contractUID,
          contractNumber: policy.contractNumber,
          companyName: policy.companyName,
          contractKind: policy.contractKind,
          deductible: policy.deductible,
          deductibleUsed: policy.deductibleUsed,
          deductibleLeft:
            Math.max(0, Math.round((policy.deductible - policy.deductibleUsed) * 100)) / 100,
          bonusStatus: policy.bonusStatus,
          bonusAmount:
            policy.bonusStatus === 'at-stake' || policy.bonusStatus === 'paid'
              ? policy.bonusAmount
              : 0,
          recommendation: policy.recommendation,
          status: policy.status,
        })),
      });
    }

    const bonusTotal = [...bonusPaid.values()].reduce((sum, amount) => sum + amount, 0);
    sendData(res, {
      since: summary.since,
      totals: {
        ...summary.totals,
        bonusPaid: Math.round(bonusTotal * 100) / 100,
        accountCount,
        contractCount,
      },
      years: [...years.values()].sort((a, b) => a.year - b.year),
      accounts,
    });
  });

  return router;
}
