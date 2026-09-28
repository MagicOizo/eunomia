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
import { notFound } from '../lib/api-error.js';

/**
 * The bank accounts of a collection agency: several at once, in the order they
 * were recorded (see Notes/eunomia-plan.md, Slice 44).
 *
 * Slice 38 read them as a history — one account in force at a time, resolved
 * against the day the invoice was paid. Production said otherwise: an agency
 * names three accounts on one bill and only the second of them on the next,
 * without anything having been replaced. So there is no rule that tells which
 * account applies; the invoice names it itself (`Invoices.agencyAccountUID`),
 * and all this module has to offer is a sensible suggestion for a new one.
 */

export const accountsTable: CrudTable = {
  table: 'AgencyBankAccounts',
  uidColumn: 'agencyAccountUID',
  statusColumn: 'agencyAccountStatus',
  entity: 'agencyAccount',
  columns: ['agencyUID', 'bankAccount', 'bic', 'recipientName', 'note'],
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
  bankAccount: ibanField,
  bic: bicField.nullish(),
  recipientName: recipientNameField.nullish(),
  note: z.string().trim().max(255).nullish(),
});

export type AccountInput = z.infer<typeof accountSchema>;

/** One stored account, as it leaves the API. */
export interface AgencyAccount {
  agencyAccountUID: string;
  bankAccount: string;
  bic: string | null;
  recipientName: string | null;
  note: string | null;
}

/**
 * The account to suggest for an agency: the one recorded first. Where an agency
 * lists several, the first is the one it is normally paid on — that is the
 * observation this slice started from. Only a suggestion: what counts is what
 * the invoice names. The twin of apps/web/src/agencies/accounts.ts.
 */
export function defaultAccount<T>(accounts: T[]): T | null {
  return accounts[0] ?? null;
}

/** The columns of an account row, as every read hands them out. */
export const ACCOUNT_COLUMNS = 'agencyAccountUID, bankAccount, bic, recipientName, note';

/**
 * Lists an agency's active accounts in the order they were recorded — the
 * auto-increment key, because that order is what `defaultAccount` reads.
 */
export async function listAccounts(db: Queryable, agencyUID: string): Promise<AgencyAccount[]> {
  return db.query<AgencyAccount[]>(
    `SELECT ${ACCOUNT_COLUMNS} FROM AgencyBankAccounts
      WHERE agencyUID = ? AND agencyAccountStatus <> -1
      ORDER BY agencyAccountID`,
    [agencyUID],
  );
}

/** Inserts a validated account for an agency (also used by the agency create transaction). */
export async function insertAccount(
  db: Queryable,
  agencyUID: string,
  data: AccountInput,
): Promise<Row> {
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
    await loadEntry(agencyUID, entryUID);
    // The schema has no agencyUID, so an account can never move between agencies.
    const data = accountSchema.partial().parse(req.body);
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
