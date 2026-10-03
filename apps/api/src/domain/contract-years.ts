import { BONUS_FORFEIT_RULES, ERROR_CODES, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type Queryable, placeholders } from '../crud/repository.js';
import { badRequest } from '../lib/api-error.js';
import { addTo } from '../lib/group.js';
import { oneOf } from '../lib/one-of.js';
import {
  type BonusClaim,
  type BonusYear,
  type BonusYearRecord,
  computeBonusTimeline,
} from './bonus-timeline.js';
import { type ContractRow, loadAuthorizedContract } from './contract-access.js';
import { type TermsWithTiers, loadTermsWithTiers } from './contract-history.js';

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));
const toFlag = (value: unknown): boolean | null => (value === null ? null : Boolean(value));

/** What the bonus timelines of a set of policies are computed from, per policy. */
export interface BonusRows {
  claims: Map<string, BonusClaim[]>;
  yearRecords: Map<string, BonusYearRecord[]>;
  terms: Map<string, TermsWithTiers[]>;
}

/**
 * Everything the bonus timeline needs, for any number of policies at once: four
 * queries for all of them instead of four per policy (CR-16). A claim row is
 * one allocation from an active billing of the policy, or — while nothing has
 * answered the invoice here yet — one pending row with a NULL reimbursement.
 */
export async function loadBonusRows(
  db: Queryable,
  contractUIDs: readonly string[],
): Promise<BonusRows> {
  const claims = new Map<string, BonusClaim[]>();
  const yearRecords = new Map<string, BonusYearRecord[]>();
  if (contractUIDs.length === 0) return { claims, yearRecords, terms: new Map() };
  const uids = [...contractUIDs];

  const claimRows = await db.query<
    Array<{
      contractUID: string;
      year: number;
      reimbursement: number | null;
      forfeitsBonus: number | null;
    }>
  >(
    `SELECT si.contractUID, YEAR(i.treatmentDate) AS year, a.reimbursement, b.forfeitsBonus
       FROM SubmissionInvoices si
       JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
       JOIN Invoices i ON i.invoiceUID = si.invoiceUID AND i.invoiceStatus <> -1
       LEFT JOIN (Allocations a
                  JOIN ServiceBillings b ON b.billingUID = a.billingUID AND b.billingStatus <> -1)
         ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
        AND b.contractUID = si.contractUID
      WHERE si.contractUID IN (${placeholders(uids)})`,
    uids,
  );
  for (const row of claimRows) {
    addTo(claims, row.contractUID, {
      year: Number(row.year),
      reimbursement: row.reimbursement,
      forfeitsBonus: toFlag(row.forfeitsBonus),
    });
  }

  const recordRows = await db.query<
    Array<{
      contractUID: string;
      year: number;
      actualBonus: number | null;
      bonusForfeited: number | null;
      note: string | null;
    }>
  >(
    `SELECT contractUID, year, actualBonus, bonusForfeited, note FROM ContractYears
      WHERE contractUID IN (${placeholders(uids)})`,
    uids,
  );
  for (const { contractUID, ...row } of recordRows) {
    addTo(yearRecords, contractUID, { ...row, bonusForfeited: toFlag(row.bonusForfeited) });
  }

  return { claims, yearRecords, terms: await loadTermsWithTiers(db, uids) };
}

/**
 * Runs the pure bonus calculation (see bonus-timeline.ts) for one policy on
 * rows that are already loaded — the half of this module that asks nothing.
 */
export function bonusTimelineFrom(
  contract: ContractRow,
  rows: BonusRows,
  currentYear = new Date().getFullYear(),
): BonusYear[] {
  const endYear = contract.contractEnd === null ? null : yearOf(contract.contractEnd);

  return computeBonusTimeline({
    rule: oneOf(BONUS_FORFEIT_RULES, contract.bonusForfeitRule, 'Contracts.bonusForfeitRule'),
    claimFreeYearsAtStart: contract.claimFreeYearsAtStart,
    countingFromYear: contract.claimFreeCountingFromYear ?? yearOf(contract.contractBegin),
    lastYear: endYear === null ? currentYear : Math.min(endYear, currentYear),
    currentYear,
    claims: rows.claims.get(contract.contractUID) ?? [],
    yearRecords: rows.yearRecords.get(contract.contractUID) ?? [],
    terms: rows.terms.get(contract.contractUID) ?? [],
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
    throw badRequest('The year must lie within the contract term', {
      code: ERROR_CODES.YEAR_OUTSIDE_CONTRACT,
    });
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
    const year = Number(pathParam(req, 'year'));
    // The same check as the PUT: without it a year outside the term — or one
    // that is not a number at all — answers 204 for a deletion that never was.
    assertYearWithinContract(contract, year);
    await pool.query('DELETE FROM ContractYears WHERE contractUID = ? AND year = ?', [
      contract.contractUID,
      year,
    ]);
    res.status(204).end();
  });

  return router;
}
