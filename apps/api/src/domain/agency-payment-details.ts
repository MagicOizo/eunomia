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
 * The payment details of a collection agency — IBAN, BIC, beneficiary and note:
 * several at once, in the order they were recorded (see Notes/eunomia-plan.md,
 * Slice 44).
 *
 * They are called payment details rather than accounts because `account` in
 * this codebase is the insured person (see Notes/eunomia-plan.md §2.8). The
 * table and the API fields predate that decision, which is why the row lives in
 * `AgencyBankAccounts` and is identified by `agencyAccountUID`: renaming those
 * would take a migration and a new API version, so they stay as they are.
 *
 * Slice 38 read them as a history — one in force at a time, resolved against
 * the day the invoice was paid. Production said otherwise: an agency names
 * three on one bill and only the second of them on the next, without anything
 * having been replaced. So there is no rule that tells which one applies; the
 * invoice names it itself (`Invoices.agencyAccountUID`), and the only thing left
 * to decide is which one to suggest — that one rule is shared with the web
 * (`defaultPaymentDetail` in @eunomia/shared).
 */

export const paymentDetailsTable: CrudTable = {
  table: 'AgencyBankAccounts',
  uidColumn: 'agencyAccountUID',
  statusColumn: 'agencyAccountStatus',
  // The entity key feeds the public ID prefix ('g'), so it keeps the old word
  // — every stored ID carries it.
  entity: 'agencyAccount',
  columns: ['agencyUID', 'bankAccount', 'bic', 'recipientName', 'note'],
};

/** IBAN — a loose length/charset check, not a checksum validation (as before). */
export const ibanField = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{15,34}$/, 'Expected an IBAN-like account number');

/** BIC — 8 or 11 characters, the shape the EPC scheme (and the GiroCode) wants. */
export const bicField = z
  .string()
  .trim()
  .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Expected a BIC of 8 or 11 characters');

/** Beneficiary name; 70 characters is the GiroCode's field length (AT-21). */
export const recipientNameField = z.string().trim().min(1).max(70);

/** The payment-detail fields, without the agency they belong to. */
export const paymentDetailSchema = z.object({
  bankAccount: ibanField,
  bic: bicField.nullish(),
  recipientName: recipientNameField.nullish(),
  note: z.string().trim().max(255).nullish(),
});

export type PaymentDetailInput = z.infer<typeof paymentDetailSchema>;

/** One stored set of payment details, as it leaves the API. */
export interface AgencyPaymentDetail {
  agencyAccountUID: string;
  bankAccount: string;
  bic: string | null;
  recipientName: string | null;
  note: string | null;
}

/** The columns of a payment-detail row, as every read hands them out. */
export const PAYMENT_DETAIL_COLUMNS = 'agencyAccountUID, bankAccount, bic, recipientName, note';

/**
 * Lists an agency's active payment details in the order they were recorded — the
 * auto-increment key, because that order is what `defaultPaymentDetail` reads.
 */
export async function listPaymentDetails(
  db: Queryable,
  agencyUID: string,
): Promise<AgencyPaymentDetail[]> {
  return db.query<AgencyPaymentDetail[]>(
    `SELECT ${PAYMENT_DETAIL_COLUMNS} FROM AgencyBankAccounts
      WHERE agencyUID = ? AND agencyAccountStatus <> -1
      ORDER BY agencyAccountID`,
    [agencyUID],
  );
}

/** Inserts one validated set of payment details (also used by the agency create transaction). */
export async function insertPaymentDetail(
  db: Queryable,
  agencyUID: string,
  data: PaymentDetailInput,
): Promise<Row> {
  return insertRow(db, paymentDetailsTable, { ...data, agencyUID });
}

/**
 * Routes for an agency's payment details: /agencies/:uid/accounts[/:entryUID] —
 * the path is part of the contract and keeps the older word. Reading happens
 * through the agency itself (it carries them), so only the writing side lives
 * here — behind MANAGE_AGENCIES, like the agency.
 */
export function createAgencyPaymentDetailsRouter(pool: Pool, config: AppConfig): Router {
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
    const entry = await getRow(pool, paymentDetailsTable, entryUID);
    if (!entry || entry.agencyUID !== agencyUID) throw notFound('Bank account');
    return entry;
  }

  router.post(base, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const data = paymentDetailSchema.parse(req.body);
    sendData(res, await insertPaymentDetail(pool, agencyUID, data), 201);
  });

  router.patch(`${base}/:entryUID`, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const entryUID = pathParam(req, 'entryUID');
    await loadEntry(agencyUID, entryUID);
    // The schema has no agencyUID, so payment details can never move agency.
    const data = paymentDetailSchema.partial().parse(req.body);
    const updated = await updateRow(pool, paymentDetailsTable, entryUID, data);
    if (!updated) throw notFound('Bank account');
    sendData(res, updated);
  });

  router.delete(`${base}/:entryUID`, requireAuth, requireManage, async (req, res) => {
    const agencyUID = pathParam(req, 'uid');
    await assertAgency(agencyUID);
    const entryUID = pathParam(req, 'entryUID');
    await loadEntry(agencyUID, entryUID);
    await softDeleteRow(pool, paymentDetailsTable, entryUID);
    res.status(204).end();
  });

  return router;
}
