import { Router } from 'express';
import type { Pool } from 'mariadb';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { notFound } from '../lib/api-error.js';
import { evaluateReimbursement } from './reimbursement.js';
import { authorizeAccount } from './workflow-access.js';

interface ContractFinancials {
  accountUID: string;
  deductible: number;
  reimbursementCap: number | null;
  bonus: number;
}

/**
 * Router exposing the "is it worth submitting?" analysis for a contract and
 * year. It aggregates that year's active invoices for the contract's account
 * (by treatment date, falling back to invoice date) and runs the pure
 * reimbursement service on the total. Mounted alongside the contracts router;
 * the two-segment path does not collide with the contracts CRUD routes.
 */
export function createReimbursementAnalysisRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/:contractUID/reimbursement-analysis', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contractUID = pathParam(req, 'contractUID');

    const [contract] = await pool.query<ContractFinancials[]>(
      `SELECT accountUID, deductible, reimbursementCap, bonus
         FROM Contracts WHERE contractUID = ? AND contractStatus <> -1 LIMIT 1`,
      [contractUID],
    );
    if (!contract) throw notFound('Contract');
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, contract.accountUID);

    const yearParam = typeof req.query.year === 'string' ? Number(req.query.year) : NaN;
    const year = Number.isInteger(yearParam) ? yearParam : new Date().getFullYear();

    const [totals] = await pool.query<Array<{ invoiceTotal: number }>>(
      `SELECT COALESCE(SUM(invoiceAmount), 0) AS invoiceTotal
         FROM Invoices
        WHERE accountUID = ? AND invoiceStatus <> -1
          AND YEAR(COALESCE(treatmentDate, invoiceDate)) = ?`,
      [contract.accountUID, year],
    );
    const [reimbursed] = await pool.query<Array<{ alreadyReimbursed: number }>>(
      `SELECT COALESCE(SUM(a.reimbursement), 0) AS alreadyReimbursed
         FROM Allocations a
         JOIN Invoices i ON i.invoiceUID = a.invoiceUID
        WHERE i.accountUID = ? AND i.invoiceStatus <> -1 AND a.allocationStatus <> -1
          AND YEAR(COALESCE(i.treatmentDate, i.invoiceDate)) = ?`,
      [contract.accountUID, year],
    );

    const invoiceTotal = totals?.invoiceTotal ?? 0;
    const analysis = evaluateReimbursement({
      deductible: contract.deductible,
      bonus: contract.bonus,
      cap: contract.reimbursementCap,
      invoiceTotal,
    });

    sendData(res, {
      contractUID,
      accountUID: contract.accountUID,
      year,
      deductible: contract.deductible,
      bonus: contract.bonus,
      reimbursementCap: contract.reimbursementCap,
      invoiceTotal,
      alreadyReimbursed: reimbursed?.alreadyReimbursed ?? 0,
      analysis,
    });
  });

  return router;
}
