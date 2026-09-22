import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { badRequest, notFound } from '../lib/api-error.js';
import type { BonusYear } from './bonus-timeline.js';
import type { ContractRow } from './contract-access.js';
import { termsForYear } from './contract-history.js';
import { loadBonusTimeline } from './contract-years.js';
import {
  type BonusMode,
  type InvoicePolicyState,
  type OptimizerInvoice,
  type OptimizerPolicy,
  type PolicyKind,
  optimizeReimbursement,
} from './reimbursement-optimizer.js';
import { authorizeAccount } from './workflow-access.js';

/**
 * How a policy's bonus stands in the year, for display: `at-stake` = still
 * to be earned, `forfeited` = lost, `paid` = received per the insurer's
 * letter, `none` = no bonus scale (or no tier reached) this year.
 */
type BonusStatus = 'at-stake' | 'forfeited' | 'paid' | 'none';

/** Maps the year of the policy's bonus timeline onto the optimizer's choice. */
function bonusFor(entry: BonusYear | undefined): {
  mode: BonusMode;
  amount: number;
  status: BonusStatus;
} {
  if (!entry) return { mode: 'forfeited', amount: 0, status: 'none' };
  if (entry.forfeited) return { mode: 'forfeited', amount: 0, status: 'forfeited' };
  if (entry.actualBonus !== null) {
    return { mode: 'paid', amount: Number(entry.actualBonus), status: 'paid' };
  }
  const expected = Number(entry.expectedBonus ?? 0);
  if (expected > 0) return { mode: 'choice', amount: expected, status: 'at-stake' };
  return { mode: 'forfeited', amount: 0, status: 'none' };
}

/**
 * GET /accounts/:accountUID/reimbursement-plan?year= — the reimbursement
 * optimizer (reimbursement-optimizer.ts) for one insured person and treatment
 * year: the account's policies running in that year with their terms and the
 * year of their bonus timeline, and the year's invoices with what is recorded
 * for each of them at each policy (exclusion, submission, reimbursements).
 */
export function createReimbursementPlanRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/:accountUID/reimbursement-plan', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const accountUID = pathParam(req, 'accountUID');
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, accountUID);

    const [account] = await pool.query<Array<{ accountUID: string }>>(
      'SELECT accountUID FROM Accounts WHERE accountUID = ? AND accountStatus <> -1 LIMIT 1',
      [accountUID],
    );
    if (!account) throw notFound('Account');

    const currentYear = new Date().getFullYear();
    let year = currentYear;
    if (req.query.year !== undefined) {
      year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2999) {
        throw badRequest('The year must be a whole number');
      }
    }

    const contracts = await pool.query<Array<ContractRow & { companyName: string }>>(
      `SELECT c.*, v.companyName
         FROM Contracts c
         JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
        WHERE c.accountUID = ? AND c.contractStatus <> -1
          AND YEAR(c.contractBegin) <= ?
          AND (c.contractEnd IS NULL OR YEAR(c.contractEnd) >= ?)`,
      [accountUID, year, year],
    );

    const policies: OptimizerPolicy[] = [];
    const details = new Map<string, Record<string, unknown>>();
    for (const contract of contracts) {
      const terms = await termsForYear(pool, contract.contractUID, year);
      const timeline = await loadBonusTimeline(pool, contract, currentYear);
      const entry = timeline.find((y) => y.year === year);
      const bonus = bonusFor(entry);
      const policy: OptimizerPolicy = {
        contractUID: contract.contractUID,
        contractNumber: String(contract.contractNumber),
        kind: contract.contractKind as PolicyKind,
        deductible: Number(terms?.deductible ?? 0),
        reimbursementCap: terms?.reimbursementCap == null ? null : Number(terms.reimbursementCap),
        reimbursementRate: Number(terms?.reimbursementRate ?? 100),
        bonusMode: bonus.mode,
        bonusAmount: bonus.amount,
      };
      policies.push(policy);
      details.set(contract.contractUID, {
        contractNumber: policy.contractNumber,
        companyName: contract.companyName,
        contractKind: policy.kind,
        hasTerms: terms !== null,
        deductible: policy.deductible,
        reimbursementCap: policy.reimbursementCap,
        reimbursementRate: policy.reimbursementRate,
        bonusStatus: bonus.status,
        // The streak a use would break; only meaningful while the bonus is at stake.
        claimFreeStreak: bonus.status === 'at-stake' ? (entry?.claimFreeStreak ?? null) : null,
        pendingClaims: entry?.pendingClaims ?? 0,
        tiersInherited: entry?.tiersInherited ?? false,
      });
    }

    const invoiceRows = await pool.query<
      Array<{
        invoiceUID: string;
        invoiceNumber: string;
        invoiceAmount: number;
        treatmentDate: string;
        reimbursementClosed: number;
      }>
    >(
      `SELECT invoiceUID, invoiceNumber, invoiceAmount, treatmentDate, reimbursementClosed
         FROM Invoices
        WHERE accountUID = ? AND invoiceStatus <> -1 AND YEAR(treatmentDate) = ?`,
      [accountUID, year],
    );
    const states = new Map<string, Record<string, InvoicePolicyState>>(
      invoiceRows.map((row) => [row.invoiceUID, {}]),
    );
    const stateOf = (invoiceUID: string, contractUID: string): InvoicePolicyState | null => {
      const perPolicy = states.get(invoiceUID);
      if (!perPolicy) return null;
      perPolicy[contractUID] ??= { excluded: false, submitted: false, actualReimbursement: null };
      return perPolicy[contractUID];
    };

    const exclusions = await pool.query<Array<{ invoiceUID: string; contractUID: string }>>(
      `SELECT x.invoiceUID, x.contractUID
         FROM InvoiceExclusions x
         JOIN Invoices i ON i.invoiceUID = x.invoiceUID
        WHERE i.accountUID = ? AND YEAR(i.treatmentDate) = ?`,
      [accountUID, year],
    );
    for (const row of exclusions) {
      const state = stateOf(row.invoiceUID, row.contractUID);
      if (state) state.excluded = true;
    }

    // One row per invoice and policy it was submitted to; the reimbursement sum
    // is NULL until a billing of that submission answered it.
    const submissions = await pool.query<
      Array<{ invoiceUID: string; contractUID: string; reimbursed: number | null }>
    >(
      `SELECT si.invoiceUID, si.contractUID, SUM(a.reimbursement) AS reimbursed
         FROM SubmissionInvoices si
         JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
         JOIN Invoices i ON i.invoiceUID = si.invoiceUID
         LEFT JOIN (Allocations a
                    JOIN ServiceBillings b
                      ON b.billingUID = a.billingUID AND b.billingStatus <> -1)
           ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
          AND b.submissionUID = si.submissionUID
        WHERE i.accountUID = ? AND YEAR(i.treatmentDate) = ?
        GROUP BY si.invoiceUID, si.contractUID`,
      [accountUID, year],
    );
    for (const row of submissions) {
      const state = stateOf(row.invoiceUID, row.contractUID);
      if (!state) continue;
      state.submitted = true;
      state.actualReimbursement = row.reimbursed === null ? null : Number(row.reimbursed);
    }

    const invoices: OptimizerInvoice[] = invoiceRows.map((row) => ({
      invoiceUID: row.invoiceUID,
      amount: Number(row.invoiceAmount),
      treatmentDate: row.treatmentDate,
      reimbursementClosed: Boolean(row.reimbursementClosed),
      policies: states.get(row.invoiceUID) ?? {},
    }));
    const invoiceNumbers = new Map(invoiceRows.map((row) => [row.invoiceUID, row.invoiceNumber]));

    const result = optimizeReimbursement({
      policies,
      invoices,
      yearInProgress: year >= currentYear,
    });
    sendData(res, {
      accountUID,
      year,
      invoiceTotal: result.invoiceTotal,
      advantage: result.advantage,
      strategies: result.strategies,
      policies: result.policies.map((plan) => ({
        ...plan,
        ...details.get(plan.contractUID),
        worthUsingAbove: plan.worthUsingAbove ?? null,
      })),
      invoices: result.invoices.map((plan) => ({
        ...plan,
        invoiceNumber: invoiceNumbers.get(plan.invoiceUID) ?? null,
      })),
    });
  });

  return router;
}
