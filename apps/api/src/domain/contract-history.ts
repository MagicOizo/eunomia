import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import {
  type CrudTable,
  type Queryable,
  type Row,
  getRow,
  insertRow,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { type ContractRow, loadAuthorizedContract } from './contract-access.js';

/**
 * The dated child rows of a policy (see Notes/eunomia-plan.md, 2.3 "Datenmodell
 * v3"): premiums valid from a date, terms valid from a calendar year. Both are
 * "valid until the next entry" histories, so they share one router shape; each
 * spec only supplies its table, its validity key and its range check.
 */

const money = z.number().min(0).max(999999.99);

const premiumsTable: CrudTable = {
  table: 'ContractPremiums',
  uidColumn: 'premiumUID',
  statusColumn: 'premiumStatus',
  entity: 'premium',
  columns: ['contractUID', 'validFrom', 'monthlyPremium', 'note'],
};

const termsTable: CrudTable = {
  table: 'ContractTerms',
  uidColumn: 'termsUID',
  statusColumn: 'termsStatus',
  entity: 'contractTerms',
  columns: ['contractUID', 'validFromYear', 'deductible', 'reimbursementCap', 'reimbursementRate'],
};

export const premiumSchema = z.object({
  validFrom: z.string().date(),
  monthlyPremium: money,
  note: z.string().trim().max(255).nullish(),
});

const bonusTier = z.object({
  claimFreeYears: z.number().int().min(1).max(99),
  bonusAmount: money,
});

export const termsSchema = z.object({
  validFromYear: z.number().int().min(1900).max(2999),
  deductible: money,
  reimbursementCap: money.nullish(),
  reimbursementRate: z.number().min(0).max(100).optional(),
  /** The bonus scale of these terms; when given, it replaces the stored set. */
  bonusTiers: z
    .array(bonusTier)
    .max(20)
    .refine(
      (tiers) => new Set(tiers.map((tier) => tier.claimFreeYears)).size === tiers.length,
      'Each number of claim-free years may appear only once in the bonus scale',
    )
    .optional(),
});

export type BonusTierInput = z.infer<typeof bonusTier>;

export interface HistorySpec {
  /** URL segment under /contracts/:uid. */
  segment: 'premiums' | 'terms';
  /** Singular name for error messages. */
  label: string;
  table: CrudTable;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Column whose value must be unique among a contract's active entries. */
  validityColumn: 'validFrom' | 'validFromYear';
  /** Rejects an entry whose validity key lies outside the contract's term. */
  assertWithinContract: (contract: ContractRow, validity: string | number) => void;
  /** Stores data kept outside the entry's own row, in the same transaction. */
  saveChildren?: (db: Queryable, entryUID: string, data: Record<string, unknown>) => Promise<void>;
}

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

export const premiumSpec: HistorySpec = {
  segment: 'premiums',
  label: 'Premium',
  table: premiumsTable,
  schema: premiumSchema,
  validityColumn: 'validFrom',
  assertWithinContract: (contract, validity) => {
    const validFrom = String(validity);
    if (validFrom < contract.contractBegin) {
      throw badRequest('A premium cannot start before the contract begins', {
        code: ERROR_CODES.HISTORY_BEFORE_CONTRACT,
        details: { kind: 'premium' },
      });
    }
    if (contract.contractEnd !== null && validFrom > contract.contractEnd) {
      throw badRequest('A premium cannot start after the contract ends', {
        code: ERROR_CODES.HISTORY_AFTER_CONTRACT,
        details: { kind: 'premium' },
      });
    }
  },
};

export const termsSpec: HistorySpec = {
  segment: 'terms',
  label: 'Contract terms',
  table: termsTable,
  schema: termsSchema,
  validityColumn: 'validFromYear',
  assertWithinContract: (contract, validity) => {
    const year = Number(validity);
    if (year < yearOf(contract.contractBegin)) {
      throw badRequest('Terms cannot start before the year the contract begins', {
        code: ERROR_CODES.HISTORY_BEFORE_CONTRACT,
        details: { kind: 'terms' },
      });
    }
    if (contract.contractEnd !== null && year > yearOf(contract.contractEnd)) {
      throw badRequest('Terms cannot start after the year the contract ends', {
        code: ERROR_CODES.HISTORY_AFTER_CONTRACT,
        details: { kind: 'terms' },
      });
    }
  },
  saveChildren: async (db, termsUID, data) => {
    const tiers = data.bonusTiers as BonusTierInput[] | undefined;
    if (tiers !== undefined) await replaceBonusTiers(db, termsUID, tiers);
  },
};

/** Replaces the bonus scale of a terms entry with the given tiers. */
async function replaceBonusTiers(
  db: Queryable,
  termsUID: string,
  tiers: BonusTierInput[],
): Promise<void> {
  await db.query('DELETE FROM ContractBonusTiers WHERE termsUID = ?', [termsUID]);
  for (const tier of tiers) {
    await db.query(
      'INSERT INTO ContractBonusTiers (termsUID, claimFreeYears, bonusAmount) VALUES (?, ?, ?)',
      [termsUID, tier.claimFreeYears, tier.bonusAmount],
    );
  }
}

/**
 * Throws 409 when another active entry of the contract already uses this
 * validity key. Exported because the trash runs it before restoring an entry:
 * a restore must never produce a state the mask itself forbids (Slice 39).
 */
export async function assertValidityFree(
  db: Queryable,
  spec: HistorySpec,
  contractUID: string,
  validity: string | number,
  ownUID: string | null,
): Promise<void> {
  const { table, uidColumn, statusColumn } = spec.table;
  const rows = await db.query<Array<{ uid: string }>>(
    `SELECT ${uidColumn} AS uid FROM ${table}
      WHERE contractUID = ? AND ${spec.validityColumn} = ? AND ${statusColumn} <> -1`,
    [contractUID, validity],
  );
  if (rows.some((row) => row.uid !== ownUID)) {
    throw conflict(`${spec.label} with this start already exists for the contract`, {
      code: ERROR_CODES.HISTORY_START_EXISTS,
      details: { kind: spec.segment === 'premiums' ? 'premium' : 'terms' },
    });
  }
}

/** Inserts a validated history entry for a contract (also used by the contract create transaction). */
export async function insertHistoryEntry(
  db: Queryable,
  segment: 'premiums' | 'terms',
  contract: ContractRow,
  data: Record<string, unknown>,
): Promise<Row> {
  const spec = segment === 'premiums' ? premiumSpec : termsSpec;
  const validity = data[spec.validityColumn] as string | number;
  spec.assertWithinContract(contract, validity);
  await assertValidityFree(db, spec, contract.contractUID, validity, null);
  const entry = await insertRow(db, spec.table, { ...data, contractUID: contract.contractUID });
  await spec.saveChildren?.(db, String(entry[spec.table.uidColumn]), data);
  return entry;
}

function createHistoryRouter(pool: Pool, config: AppConfig, spec: HistorySpec): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const base = `/:uid/${spec.segment}`;

  /** Loads the entry and checks that it belongs to the contract in the URL. */
  async function loadEntry(contractUID: string, entryUID: string): Promise<Row> {
    const entry = await getRow(pool, spec.table, entryUID);
    if (!entry || entry.contractUID !== contractUID) throw notFound(spec.label);
    return entry;
  }

  router.post(base, requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.MANAGE_CONTRACTS,
    );
    const data = spec.schema.parse(req.body);
    const entry = await withTransaction(pool, (conn) =>
      insertHistoryEntry(conn, spec.segment, contract, data),
    );
    sendData(res, entry, 201);
  });

  router.patch(`${base}/:entryUID`, requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.MANAGE_CONTRACTS,
    );
    const entryUID = pathParam(req, 'entryUID');
    const entry = await loadEntry(contract.contractUID, entryUID);
    const data = spec.schema.partial().parse(req.body);
    const validity = (data[spec.validityColumn] ?? entry[spec.validityColumn]) as string | number;
    spec.assertWithinContract(contract, validity);
    // The schema has no contractUID, so an entry can never move between contracts.
    const updated = await withTransaction(pool, async (conn) => {
      // Inside the transaction, as on the POST path (via insertHistoryEntry):
      // no UNIQUE index backs this rule, so the check and the write it guards
      // have to be the same transaction or two concurrent edits both pass.
      await assertValidityFree(conn, spec, contract.contractUID, validity, entryUID);
      const row = await updateRow(conn, spec.table, entryUID, data);
      if (!row) throw notFound(spec.label);
      await spec.saveChildren?.(conn, entryUID, data);
      return row;
    });
    sendData(res, updated);
  });

  router.delete(`${base}/:entryUID`, requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const contract = await loadAuthorizedContract(
      pool,
      user.userId,
      pathParam(req, 'uid'),
      PERMISSIONS.MANAGE_CONTRACTS,
    );
    const entryUID = pathParam(req, 'entryUID');
    await loadEntry(contract.contractUID, entryUID);
    await softDeleteRow(pool, spec.table, entryUID);
    res.status(204).end();
  });

  return router;
}

/** Routes for a contract's premium history: /contracts/:uid/premiums[/:entryUID]. */
export function createContractPremiumsRouter(pool: Pool, config: AppConfig): Router {
  return createHistoryRouter(pool, config, premiumSpec);
}

/** Routes for a contract's yearly terms: /contracts/:uid/terms[/:entryUID]. */
export function createContractTermsRouter(pool: Pool, config: AppConfig): Router {
  return createHistoryRouter(pool, config, termsSpec);
}

/** Returns the ISO date one day before the given ISO date. */
function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Lists a contract's active premiums, oldest first, each with a derived
 * `validTo`: the day before the next entry starts, or the contract end for the
 * latest one (null while the contract is open-ended).
 */
export async function listPremiumsWithValidity(
  db: Queryable,
  contract: ContractRow,
): Promise<Row[]> {
  const rows = await db.query<Row[]>(
    `SELECT premiumUID, validFrom, monthlyPremium, note FROM ContractPremiums
      WHERE contractUID = ? AND premiumStatus <> -1 ORDER BY validFrom`,
    [contract.contractUID],
  );
  return rows.map((row, index) => {
    const next = rows[index + 1];
    return { ...row, validTo: next ? dayBefore(String(next.validFrom)) : contract.contractEnd };
  });
}

/**
 * Lists a contract's active terms, oldest first, each with a derived
 * `validToYear` and its bonus scale (tiers ordered by claim-free years).
 */
export async function listTermsWithValidity(db: Queryable, contract: ContractRow): Promise<Row[]> {
  const rows = await db.query<Row[]>(
    `SELECT termsUID, validFromYear, deductible, reimbursementCap, reimbursementRate FROM ContractTerms
      WHERE contractUID = ? AND termsStatus <> -1 ORDER BY validFromYear`,
    [contract.contractUID],
  );
  const tiers = await db.query<Array<BonusTierInput & { termsUID: string }>>(
    `SELECT b.termsUID, b.claimFreeYears, b.bonusAmount
       FROM ContractBonusTiers b
       JOIN ContractTerms t ON t.termsUID = b.termsUID
      WHERE t.contractUID = ? AND t.termsStatus <> -1
      ORDER BY b.claimFreeYears`,
    [contract.contractUID],
  );
  const endYear = contract.contractEnd === null ? null : yearOf(contract.contractEnd);
  return rows.map((row, index) => {
    const next = rows[index + 1];
    return {
      ...row,
      validToYear: next ? Number(next.validFromYear) - 1 : endYear,
      bonusTiers: tiers
        .filter((tier) => tier.termsUID === row.termsUID)
        .map(({ claimFreeYears, bonusAmount }) => ({ claimFreeYears, bonusAmount })),
    };
  });
}

/** The terms in force for a contract in a calendar year, or null when none are recorded yet. */
export async function termsForYear(
  db: Queryable,
  contractUID: string,
  year: number,
): Promise<{
  deductible: number;
  reimbursementCap: number | null;
  reimbursementRate: number;
} | null> {
  const rows = await db.query<
    Array<{ deductible: number; reimbursementCap: number | null; reimbursementRate: number }>
  >(
    `SELECT deductible, reimbursementCap, reimbursementRate FROM ContractTerms
      WHERE contractUID = ? AND termsStatus <> -1 AND validFromYear <= ?
      ORDER BY validFromYear DESC LIMIT 1`,
    [contractUID, year],
  );
  return rows[0] ?? null;
}
