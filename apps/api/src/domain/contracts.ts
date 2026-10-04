import { BONUS_FORFEIT_RULES, CONTRACT_KINDS, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { forbidden } from '../auth/errors.js';
import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { accountFilter, hasPermission } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { parseQuery, pathParam } from '../crud/params.js';
import { type Row, insertRow, softDeleteRow, updateRow } from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { contractsTable, loadAuthorizedContract } from './contract-access.js';
import { insertHistoryEntry, listPremiumsWithValidity, withValidity } from './contract-history.js';
import { bonusTimelineFrom, loadBonusRows } from './contract-years.js';

const money = z.number().min(0).max(999999.99);

const base = z.object({
  contractNumber: z.string().trim().min(1).max(50),
  companyUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.company)),
  accountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.account)),
  contractKind: z.enum(CONTRACT_KINDS).optional(),
  contractBegin: z.string().date(),
  contractEnd: z.string().date().nullish(),
  bonusForfeitRule: z.enum(BONUS_FORFEIT_RULES).optional(),
  claimFreeYearsAtStart: z.number().int().min(0).max(99).optional(),
  claimFreeCountingFromYear: z.number().int().min(1900).max(2999).nullish(),
});

/**
 * Optional starting values on create: the first premium (valid from the
 * contract begin) and the first terms (valid from its year), so a new policy
 * is usable in one step instead of three.
 */
const createSchema = base.extend({
  initialMonthlyPremium: money.optional(),
  initialDeductible: money.optional(),
  initialReimbursementCap: money.nullish(),
  initialReimbursementRate: z.number().min(0).max(100).optional(),
});

/**
 * The list takes one filter, the insured person — like the invoice and billing
 * searches, so a workspace does not have to fetch every policy and drop what it
 * does not need (CR-27).
 */
const listQuery = z.object({
  accountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.account)).optional(),
});

// accountUID is immutable: a contract belongs to one insured person for life,
// and allowing a move would require permission on both the old and new account.
const updateSchema = base.omit({ accountUID: true }).partial();

/**
 * Current values shown in the policy list: the latest premium that has
 * started, and the terms in force for the current year. The company name lets
 * pickers tell a person's full and supplementary policy apart.
 */
const LIST_SELECT = `
  SELECT c.contractUID, c.contractNumber, c.companyUID, c.accountUID, c.contractKind,
         c.contractBegin, c.contractEnd, c.bonusForfeitRule, c.claimFreeYearsAtStart,
         c.claimFreeCountingFromYear, c.contractStatus, v.companyName,
         (SELECT p.monthlyPremium FROM ContractPremiums p
           WHERE p.contractUID = c.contractUID AND p.premiumStatus <> -1 AND p.validFrom <= CURDATE()
           ORDER BY p.validFrom DESC LIMIT 1) AS currentMonthlyPremium,
         t.deductible AS currentDeductible,
         t.reimbursementCap AS currentReimbursementCap
    FROM Contracts c
    JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
    LEFT JOIN ContractTerms t ON t.termsUID = (
      SELECT t2.termsUID FROM ContractTerms t2
       WHERE t2.contractUID = c.contractUID AND t2.termsStatus <> -1 AND t2.validFromYear <= YEAR(CURDATE())
       ORDER BY t2.validFromYear DESC LIMIT 1)
   WHERE c.contractStatus <> -1`;

/**
 * CRUD router for policies (Policen). A contract is scoped to its owning
 * account, so every check resolves the permission against that account's UID:
 * on create it comes from the request body, on the single-resource routes it
 * comes from the stored contract. Premiums, terms and year records have their
 * own routes (see contract-history.ts, contract-years.ts); the detail route
 * embeds the premiums, the terms and the computed bonus timeline.
 */
export function createContractsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const where: string[] = [];
    const params: unknown[] = [];

    const requestedAccount = parseQuery(req, listQuery).accountUID;
    if (requestedAccount !== undefined) {
      if (!(await hasPermission(pool, user.userId, PERMISSIONS.VIEW_CONTRACTS, requestedAccount))) {
        throw forbidden(PERMISSIONS.VIEW_CONTRACTS, requestedAccount);
      }
      where.push('c.accountUID = ?');
      params.push(requestedAccount);
    } else {
      // Without an account the list runs over everything the user may see —
      // the same two ends as the invoice and billing searches (invoices.ts).
      const accountScope = await accountFilter(
        pool,
        user.userId,
        PERMISSIONS.VIEW_CONTRACTS,
        'c.accountUID',
      );
      if (accountScope === null) {
        sendData(res, []);
        return;
      }
      where.push(accountScope.clause);
      params.push(...accountScope.params);
    }

    sendData(
      res,
      await pool.query<Row[]>(
        `${LIST_SELECT} AND ${where.join(' AND ')} ORDER BY c.contractUID`,
        params,
      ),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.VIEW_CONTRACTS,
    );
    // The terms travel twice through this answer — as the history and inside
    // the bonus timeline — but they are read once (CR-16).
    const bonusRows = await loadBonusRows(pool, [contract.contractUID]);
    sendData(res, {
      ...contract,
      premiums: await listPremiumsWithValidity(pool, contract),
      terms: withValidity(contract, bonusRows.terms.get(contract.contractUID) ?? []),
      years: bonusTimelineFrom(contract, bonusRows),
    });
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const {
      initialMonthlyPremium,
      initialDeductible,
      initialReimbursementCap,
      initialReimbursementRate,
      ...data
    } = createSchema.parse(req.body);
    const allowed = await hasPermission(
      pool,
      user.userId,
      PERMISSIONS.MANAGE_CONTRACTS,
      data.accountUID,
    );
    if (!allowed) throw forbidden(PERMISSIONS.MANAGE_CONTRACTS, data.accountUID);

    const contract = await withTransaction(pool, async (conn) => {
      const created = await insertRow(conn, contractsTable, data);
      if (initialMonthlyPremium !== undefined) {
        await insertHistoryEntry(conn, 'premiums', created, {
          validFrom: created.contractBegin,
          monthlyPremium: initialMonthlyPremium,
        });
      }
      const hasInitialTerms =
        initialDeductible !== undefined ||
        (initialReimbursementCap !== undefined && initialReimbursementCap !== null) ||
        initialReimbursementRate !== undefined;
      if (hasInitialTerms) {
        await insertHistoryEntry(conn, 'terms', created, {
          validFromYear: Number(created.contractBegin.slice(0, 4)),
          deductible: initialDeductible ?? 0,
          reimbursementCap: initialReimbursementCap ?? null,
          ...(initialReimbursementRate !== undefined && {
            reimbursementRate: initialReimbursementRate,
          }),
        });
      }
      return created;
    });
    sendData(res, contract, 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await loadAuthorizedContract(pool, user.userId, uid, PERMISSIONS.MANAGE_CONTRACTS);
    const data = updateSchema.parse(req.body);
    const updated = await updateRow(pool, contractsTable, uid, data);
    if (!updated) throw notFound('Contract');
    sendData(res, updated);
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await loadAuthorizedContract(pool, user.userId, uid, PERMISSIONS.MANAGE_CONTRACTS);
    await softDeleteRow(pool, contractsTable, uid);
    res.status(204).end();
  });

  return router;
}
