import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import type { Queryable } from '../crud/repository.js';
import { badRequest } from '../lib/api-error.js';
import {
  type BonusClaim,
  type BonusForfeitRule,
  type BonusTerms,
  type BonusYear,
  type BonusYearRecord,
  computeBonusTimeline,
} from './bonus-timeline.js';
import { type ContractRow, loadAuthorizedContract } from './contract-access.js';
import { listTermsWithValidity } from './contract-history.js';

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));
const toFlag = (value: unknown): boolean | null => (value === null ? null : Boolean(value));

/**
 * Loads everything the bonus timeline needs for one policy and runs the pure
 * calculation (see bonus-timeline.ts). A claim row is one allocation from an
 * active billing of the submission, or — while the submission has none for
 * the invoice — one pending row with a NULL reimbursement.
 */
export async function loadBonusTimeline(
  db: Queryable,
  contract: ContractRow,
  currentYear = new Date().getFullYear(),
): Promise<BonusYear[]> {
  const claimRows = await db.query<
    Array<{ year: number; reimbursement: number | null; forfeitsBonus: number | null }>
  >(
    `SELECT YEAR(i.treatmentDate) AS year, a.reimbursement, b.forfeitsBonus
       FROM SubmissionInvoices si
       JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
       JOIN Invoices i ON i.invoiceUID = si.invoiceUID AND i.invoiceStatus <> -1
       LEFT JOIN (Allocations a
                  JOIN ServiceBillings b ON b.billingUID = a.billingUID AND b.billingStatus <> -1)
         ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
        AND b.submissionUID = si.submissionUID
      WHERE si.contractUID = ?`,
    [contract.contractUID],
  );
  const claims: BonusClaim[] = claimRows.map((row) => ({
    year: Number(row.year),
    reimbursement: row.reimbursement,
    forfeitsBonus: toFlag(row.forfeitsBonus),
  }));

  const recordRows = await db.query<
    Array<{
      year: number;
      actualBonus: number | null;
      bonusForfeited: number | null;
      note: string | null;
    }>
  >('SELECT year, actualBonus, bonusForfeited, note FROM ContractYears WHERE contractUID = ?', [
    contract.contractUID,
  ]);
  const yearRecords: BonusYearRecord[] = recordRows.map((row) => ({
    ...row,
    bonusForfeited: toFlag(row.bonusForfeited),
  }));

  const terms = (await listTermsWithValidity(db, contract)) as unknown as BonusTerms[];
  const counting = contract.claimFreeCountingFromYear;
  const endYear = contract.contractEnd === null ? null : yearOf(contract.contractEnd);

  return computeBonusTimeline({
    rule: contract.bonusForfeitRule as BonusForfeitRule,
    claimFreeYearsAtStart: Number(contract.claimFreeYearsAtStart),
    countingFromYear: typeof counting === 'number' ? counting : yearOf(contract.contractBegin),
    lastYear: endYear === null ? currentYear : Math.min(endYear, currentYear),
    currentYear,
    claims,
    yearRecords,
    terms,
  });
}

const yearSchema = z.object({
  actualBonus: z.number().min(0).max(999999.99).nullish(),
  bonusForfeited: z.boolean().nullish(),
  note: z.string().trim().max(255).nullish(),
});

/** Throws 400 unless the year lies within the contract's term. */
function assertYearWithinContract(contract: ContractRow, year: number): void {
  const endYear = contract.contractEnd === null ? 2999 : yearOf(contract.contractEnd);
  if (!Number.isInteger(year) || year < yearOf(contract.contractBegin) || year > endYear) {
    throw badRequest('The year must lie within the contract term');
  }
}

/**
 * Routes for what the author records per policy and year (ContractYears):
 * PUT /contracts/:uid/years/:year stores the actually paid bonus, the manual
 * "bonus forfeited" override and a note; a PUT with nothing left in it, or a
 * DELETE, removes the row so the year follows the calculation again.
 */
export function createContractYearsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.put('/:uid/years/:year', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.MANAGE_CONTRACTS,
    );
    const year = Number(pathParam(req, 'year'));
    assertYearWithinContract(contract, year);
    const data = yearSchema.parse(req.body);
    const record = {
      actualBonus: data.actualBonus ?? null,
      bonusForfeited: data.bonusForfeited ?? null,
      note: data.note ? data.note : null,
    };

    if (Object.values(record).every((value) => value === null)) {
      await pool.query('DELETE FROM ContractYears WHERE contractUID = ? AND year = ?', [
        contract.contractUID,
        year,
      ]);
    } else {
      await pool.query(
        `INSERT INTO ContractYears (contractUID, year, actualBonus, bonusForfeited, note)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE actualBonus = VALUES(actualBonus),
           bonusForfeited = VALUES(bonusForfeited), note = VALUES(note)`,
        [
          contract.contractUID,
          year,
          record.actualBonus,
          record.bonusForfeited === null ? null : Number(record.bonusForfeited),
          record.note,
        ],
      );
    }
    sendData(res, { contractUID: contract.contractUID, year, ...record });
  });

  router.delete('/:uid/years/:year', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.MANAGE_CONTRACTS,
    );
    await pool.query('DELETE FROM ContractYears WHERE contractUID = ? AND year = ?', [
      contract.contractUID,
      Number(pathParam(req, 'year')),
    ]);
    res.status(204).end();
  });

  return router;
}
