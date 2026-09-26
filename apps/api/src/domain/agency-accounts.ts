import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
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
import { conflict, notFound } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';

/**
 * The bank accounts of a collection agency, as a history (see
 * Notes/eunomia-plan.md, Slice 38): an agency that changes its account keeps
 * its identity, and an invoice shows the account its money actually went to.
 *
 * Same "valid until the next entry" shape as ContractPremiums, with one
 * difference: `validFrom` may be NULL, which means "applies from the
 * beginning". The first account of an agency therefore carries no date at all —
 * nothing would be known to put there — and only a later change does. At most
 * one undated entry per agency, or the resolution below would be ambiguous.
 */

export const accountsTable: CrudTable = {
  table: 'AgencyBankAccounts',
  uidColumn: 'agencyAccountUID',
  statusColumn: 'agencyAccountStatus',
  entity: 'agencyAccount',
  columns: ['agencyUID', 'validFrom', 'bankAccount', 'bic', 'recipientName', 'note'],
};

/** IBAN — a loose length/charset check, not a checksum validation (as before). */
export const ibanField = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{15,34}$/, 'Expected an IBAN-like account');

/** BIC — 8 or 11 characters, the shape the EPC scheme (and the GiroCode) wants. */
export const bicField = z
  .string()
  .trim()
  .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Expected a BIC of 8 or 11 characters');

/** Beneficiary name; 70 characters is the GiroCode's field length (AT-21). */
export const recipientNameField = z.string().trim().min(1).max(70);

/** The account fields, without the agency they belong to. */
export const accountSchema = z.object({
  /** Missing or null means "applies from the beginning" — see the module comment. */
  validFrom: z.string().date().nullish(),
  bankAccount: ibanField,
  bic: bicField.nullish(),
  recipientName: recipientNameField.nullish(),
  note: z.string().trim().max(255).nullish(),
});

export type AccountInput = z.infer<typeof accountSchema>;

/** One stored account, as it leaves the API. */
export interface AgencyAccount {
  agencyAccountUID: string;
  validFrom: string | null;
  bankAccount: string;
  bic: string | null;
  recipientName: string | null;
  note: string | null;
}

/** Today as `YYYY-MM-DD` in the server's zone — the default resolution date. */
function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The account in force on `date`: the newest entry that had already started —
 * an undated entry counts as "started long ago", so it is the fallback for
 * every date before the first recorded change. `date` is the day the money
 * moved (an invoice's `transferDate`); null means today, which is what an
 * unpaid invoice is about. Returns null only when the agency has no account at
 * all. The twin of apps/web/src/agencies/accounts.ts — change one, change the
 * other.
 */
export function accountInForce<T extends { validFrom: string | null }>(
  accounts: T[],
  date: string | null = null,
): T | null {
  const on = date ?? today();
  let best: T | null = null;
  for (const account of accounts) {
    if (account.validFrom !== null && account.validFrom > on) continue;
    // An undated entry loses against any dated one that has started.
    if (best === null || (account.validFrom ?? '') >= (best.validFrom ?? '')) best = account;
  }
  return best;
}

/** Returns the ISO date one day before the given ISO date. */
function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** One account plus the `validTo` derived from the entry that follows it. */
export interface AgencyAccountWithValidity extends AgencyAccount {
  validTo: string | null;
}

/**
 * Adds each account's `validTo` — the day before the next entry starts, null
 * for the one in force. Expects the accounts oldest first, with the undated
 * entry (if any) at the front.
 */
export function withValidity<T extends { validFrom: string | null }>(
  accounts: T[],
): Array<T & { validTo: string | null }> {
  return accounts.map((account, index) => {
    const next = accounts[index + 1];
    return { ...account, validTo: next?.validFrom ? dayBefore(next.validFrom) : null };
  });
}

/** The columns of an account row, as every read hands them out. */
export const ACCOUNT_COLUMNS = 'agencyAccountUID, validFrom, bankAccount, bic, recipientName, note';

/**
 * Lists an agency's active accounts, oldest first — an undated entry sorts
 * first, because MariaDB orders NULL lowest, which is exactly what "from the
 * beginning" means — each with its derived `validTo`.
 */
export async function listAccountsWithValidity(
  db: Queryable,
  agencyUID: string,
): Promise<AgencyAccountWithValidity[]> {
  const rows = await db.query<AgencyAccount[]>(
    `SELECT ${ACCOUNT_COLUMNS} FROM AgencyBankAccounts
      WHERE agencyUID = ? AND agencyAccountStatus <> -1
      ORDER BY validFrom`,
    [agencyUID],
  );
  return withValidity(rows);
}

/**
 * Throws 409 when another active account of the agency already starts on this
 * day — including the undated case, which the database cannot catch: a UNIQUE
 * key accepts NULL any number of times.
 */
export async function assertStartFree(
  db: Queryable,
  agencyUID: string,
  validFrom: string | null,
  ownUID: string | null,
): Promise<void> {
  const rows = await db.query<Array<{ uid: string }>>(
    `SELECT agencyAccountUID AS uid FROM AgencyBankAccounts
      WHERE agencyUID = ? AND agencyAccountStatus <> -1
        AND ${validFrom === null ? 'validFrom IS NULL' : 'validFrom = ?'}`,
    validFrom === null ? [agencyUID] : [agencyUID, validFrom],
  );
  if (rows.some((row) => row.uid !== ownUID)) {
    throw conflict('Bank account with this start already exists for the agency', {
      code: ERROR_CODES.HISTORY_START_EXISTS,
      details: { kind: 'agencyAccount', undated: validFrom === null },
    });
  }
}

/** Inserts a validated account for an agency (also used by the agency create transaction). */
export async function insertAccount(
  db: Queryable,
  agencyUID: string,
  data: AccountInput,
): Promise<Row> {
  await assertStartFree(db, agencyUID, data.validFrom ?? null, null);
  return insertRow(db, accountsTable, { ...data, agencyUID });
}

/**
 * Routes for an agency's bank accounts: /agencies/:uid/accounts[/:entryUID].
 * Reading happens through the agency itself (it carries its accounts), so only
 * the writing side lives here — behind MANAGE_AGENCIES, like the agency.
 */
export function createAgencyAccountsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireManage = createRequirePermission(pool, PERMISSIONS.MANAGE_AGENCIES);
  const base = '/:uid/accounts';

  /** Throws 404 unless the agency exists and is not deleted. */
  async function assertAgency(agencyUID: string): Promise<void> {
    const rows = await pool.query<Array<{ uid: string }>>(
      'SELECT agencyUID AS uid FROM CollectionAgencies WHERE agencyUID = ? AND agencyStatus <> -1',
      [agencyUID],
    );
    if (rows.length === 0) throw notFound('Collection agency');
  }

  /** Loads the entry and checks that it belongs to the agency in the URL. */
  async function loadEntry(agencyUID: string, entryUID: string): Promise<Row> {
    const entry = await getRow(pool, accountsTable, entryUID);
    if (!entry || entry.agencyUID !== agencyUID) throw notFound('Bank account');
    return entry;
  }

  router.post(base, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const data = accountSchema.parse(req.body);
    sendData(res, await insertAccount(pool, agencyUID, data), 201);
  });

  router.patch(`${base}/:entryUID`, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const entryUID = pathParam(req, 'entryUID');
    const entry = await loadEntry(agencyUID, entryUID);
    const data = accountSchema.partial().parse(req.body);
    // The schema has no agencyUID, so an account can never move between agencies.
    const validFrom = (
      Object.prototype.hasOwnProperty.call(data, 'validFrom') ? data.validFrom : entry.validFrom
    ) as string | null;
    await assertStartFree(pool, agencyUID, validFrom ?? null, entryUID);
    const updated = await updateRow(pool, accountsTable, entryUID, data);
    if (!updated) throw notFound('Bank account');
    sendData(res, updated);
  });

  router.delete(`${base}/:entryUID`, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const entryUID = pathParam(req, 'entryUID');
    await loadEntry(agencyUID, entryUID);
    await softDeleteRow(pool, accountsTable, entryUID);
    res.status(204).end();
  });

  return router;
}
