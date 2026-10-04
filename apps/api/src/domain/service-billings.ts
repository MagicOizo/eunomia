import { ERROR_CODES, isHttpUrl, PERMISSIONS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { accountFilter } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { parseQuery, pathParam } from '../crud/params.js';
import {
  type Queryable,
  type Row,
  crudTable,
  deletionTimestamp,
  getRow,
  insertRow,
  placeholders,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { conflict, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { likeTerm } from '../lib/like.js';
import { allocationEntriesSchema, createAllocationsForBilling } from './allocations.js';
import { requireBillingAccount, requireContractAccount } from './workflow-access.js';

/** A row of the service-billing table, in the types the database guarantees. */
export type BillingRow = {
  billingUID: string;
  contractUID: string;
  billingDate: string;
  billingNumber: string;
  documentLink: string | null;
  /** TINYINT(1), and nullable: null follows the policy's `bonusForfeitRule`. */
  forfeitsBonus: number | null;
  objectionDate: string | null;
  objectionResolvedDate: string | null;
  objectionNote: string | null;
  billingStatus: number;
};

export const billingsTable = crudTable<BillingRow>({
  table: 'ServiceBillings',
  uidColumn: 'billingUID',
  statusColumn: 'billingStatus',
  entity: 'serviceBilling',
  columns: [
    'contractUID',
    'billingDate',
    'billingNumber',
    'documentLink',
    'forfeitsBonus',
    'objectionDate',
    'objectionResolvedDate',
    'objectionNote',
  ],
});

const base = z.object({
  contractUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.contract)),
  billingDate: z.string().date(),
  billingNumber: z.string().trim().min(1).max(50),
  // `.url()` asks whether this is an address, `isHttpUrl` whether a browser may
  // follow it: zod's URL check takes `javascript:` and `data:` too (SEC-01).
  documentLink: z.string().trim().url().max(255).refine(isHttpUrl).nullish(),
  // Whether this billing forfeits the policy's bonus for the treatment year
  // (see bonus-timeline.ts); null follows the policy's bonusForfeitRule.
  forfeitsBonus: z
    .boolean()
    .nullable()
    .transform((value) => (value === null ? null : Number(value)))
    .optional(),
});

// Objection ("Widerspruch") fields are only ever set after creation, via PATCH.
const objection = z.object({
  objectionDate: z.string().date().nullish(),
  objectionResolvedDate: z.string().date().nullish(),
  objectionNote: z.string().trim().max(500).nullish(),
});

// A billing stays with its policy; its own fields plus the objection state
// are editable.
const updateSchema = base.omit({ contractUID: true }).extend(objection.shape).partial();

/**
 * Filters for the billings list, used by the "Leistungsabrechnung auswählen"
 * sub-dialog and the filter bar of the billings list. `contractUID` scopes the
 * result to one policy; the rest narrow it down further.
 */
const listQuery = z.object({
  contractUID: z.string().trim().min(1).optional(),
  /** Free text over billing number, policy number, insured person and invoice numbers. */
  q: z.string().trim().min(1).max(50).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** 'true' keeps only billings without a reimbursement booked on them yet. */
  unlinked: z.enum(['true', 'false']).optional(),
  minReimbursement: z.coerce.number().min(0).max(99999999.99).optional(),
  maxReimbursement: z.coerce.number().min(0).max(99999999.99).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Guards UNIQUE (contractUID, billingNumber) before the database does. The
 * index is the real rule — this only turns it into a sentence that names the
 * number, instead of the generic "duplicate value" the driver's 1062 maps to.
 * `exceptUID` leaves the billing being edited out of its own check.
 */
export async function assertBillingNumberFree(
  pool: Queryable,
  contractUID: string,
  billingNumber: string,
  exceptUID?: string,
): Promise<void> {
  const [taken] = await pool.query<Array<{ billingUID: string }>>(
    `SELECT billingUID FROM ServiceBillings
      WHERE contractUID = ? AND billingNumber = ? AND billingStatus <> -1
        AND billingUID <> ?
      LIMIT 1`,
    [contractUID, billingNumber, exceptUID ?? ''],
  );
  if (taken) {
    throw conflict(`The policy already has a service billing numbered ${billingNumber}`, {
      code: ERROR_CODES.BILLING_NUMBER_TAKEN,
      details: { billingNumber },
    });
  }
}

/** Exposes the TINYINT(1) forfeit flag as boolean | null. */
function toBillingDto(row: Row | null): Row | null {
  if (row === null) return null;
  return { ...row, forfeitsBonus: row.forfeitsBonus === null ? null : Boolean(row.forfeitsBonus) };
}

/**
 * The invoice numbers booked on each of the given billings, ready for the list
 * column, in one query for all of them. Deleted invoices stay out, as they did
 * while a join fed the column.
 */
async function invoiceNumbersFor(pool: Pool, billingUIDs: string[]): Promise<Map<string, string>> {
  const numbers = new Map<string, string>();
  if (billingUIDs.length === 0) return numbers;
  const rows = await pool.query<Array<{ billingUID: string; invoiceNumber: string }>>(
    `SELECT al.billingUID, inv.invoiceNumber
       FROM Allocations al
       JOIN Invoices inv ON inv.invoiceUID = al.invoiceUID AND inv.invoiceStatus <> -1
      WHERE al.allocationStatus <> -1
        AND al.billingUID IN (${placeholders(billingUIDs)})
      ORDER BY inv.invoiceNumber`,
    billingUIDs,
  );
  for (const row of rows) {
    const seen = numbers.get(row.billingUID);
    numbers.set(
      row.billingUID,
      seen === undefined ? row.invoiceNumber : `${seen}, ${row.invoiceNumber}`,
    );
  }
  return numbers;
}

/**
 * Router for service billings (Leistungsabrechnungen), attached to a policy.
 * Which submissions one answers follows from its allocations — the insurer
 * regularly settles invoices submitted on different days in one letter.
 */
export function createServiceBillingsRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const filters = parseQuery(req, listQuery);
    const where = ['b.billingStatus <> -1'];
    const having: string[] = [];
    const params: unknown[] = [];
    const havingParams: unknown[] = [];

    const { contractUID } = filters;
    if (contractUID !== undefined) {
      await requireContractAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, contractUID);
      where.push('c.contractUID = ?');
      params.push(contractUID);
    } else {
      const accountScope = await accountFilter(
        pool,
        user.userId,
        PERMISSIONS.VIEW_INVOICES,
        'c.accountUID',
      );
      if (accountScope === null) {
        sendData(res, []);
        return;
      }
      where.push(accountScope.clause);
      params.push(...accountScope.params);
    }

    if (filters.q !== undefined) {
      // The invoice numbers are matched through their own EXISTS rather than
      // the joined rows, so the free text never changes the aggregates below.
      where.push(`(b.billingNumber LIKE ? ESCAPE '!' OR c.contractNumber LIKE ? ESCAPE '!'
                   OR CONCAT_WS(' ', acc.firstname, acc.surname) LIKE ? ESCAPE '!'
                   OR EXISTS (
                        SELECT 1 FROM Allocations qa
                          JOIN Invoices qi ON qi.invoiceUID = qa.invoiceUID AND qi.invoiceStatus <> -1
                         WHERE qa.billingUID = b.billingUID AND qa.allocationStatus <> -1
                           AND qi.invoiceNumber LIKE ? ESCAPE '!'
                      ))`);
      const like = likeTerm(filters.q);
      params.push(like, like, like, like);
    }
    if (filters.from !== undefined) {
      where.push('b.billingDate >= ?');
      params.push(filters.from);
    }
    if (filters.to !== undefined) {
      where.push('b.billingDate <= ?');
      params.push(filters.to);
    }
    if (filters.unlinked === 'true') {
      where.push(
        `NOT EXISTS (SELECT 1 FROM Allocations ua
                      WHERE ua.billingUID = b.billingUID AND ua.allocationStatus <> -1)`,
      );
    }
    if (filters.minReimbursement !== undefined) {
      having.push('COALESCE(SUM(al.reimbursement), 0) >= ?');
      havingParams.push(filters.minReimbursement);
    }
    if (filters.maxReimbursement !== undefined) {
      having.push('COALESCE(SUM(al.reimbursement), 0) <= ?');
      havingParams.push(filters.maxReimbursement);
    }
    // A parameter like every other value, not an inlined number: zod has
    // narrowed it to an integer in range by now, but I-4 knows no exceptions,
    // and the clause and its value have to stay in step.
    const limit = filters.limit === undefined ? '' : ' LIMIT ?';
    const limitParams = filters.limit === undefined ? [] : [filters.limit];

    const rows = await pool.query<Array<Row & { billingUID: string }>>(
      `SELECT b.billingUID, b.billingDate, b.billingNumber, b.documentLink,
              b.contractUID, b.forfeitsBonus, b.objectionDate, b.objectionResolvedDate,
              b.objectionNote, b.billingStatus,
              c.accountUID, c.contractNumber, c.bonusForfeitRule,
              CONCAT_WS(' ', acc.firstname, acc.surname) AS personName,
              COALESCE(SUM(al.reimbursement), 0) AS reimbursedTotal,
              COUNT(al.allocationID) AS invoiceCount
         FROM ServiceBillings b
         JOIN Contracts c ON c.contractUID = b.contractUID
         JOIN Accounts acc ON acc.accountUID = c.accountUID
         LEFT JOIN Allocations al ON al.billingUID = b.billingUID AND al.allocationStatus <> -1
        WHERE ${where.join(' AND ')}
        GROUP BY b.billingID
        ${having.length > 0 ? `HAVING ${having.join(' AND ')}` : ''}
        ORDER BY b.billingDate DESC, b.billingUID${limit}`,
      [...params, ...havingParams, ...limitParams],
    );

    // The invoice numbers come as their own query rather than a GROUP_CONCAT:
    // that function truncates at group_concat_max_len (1 KB by default) without
    // saying so, and a billing that silently lost the tail of its list would
    // look like a correct answer.
    const numbers = await invoiceNumbersFor(
      pool,
      rows.map((row) => row.billingUID),
    );
    sendData(
      res,
      rows.map((row) => ({
        ...toBillingDto(row),
        invoiceNumbers: numbers.get(row.billingUID) ?? null,
      })),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireBillingAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, uid);
    sendData(res, toBillingDto(await getRow(pool, billingsTable, uid)));
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    await requireContractAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, data.contractUID);
    await assertBillingNumberFree(pool, data.contractUID, data.billingNumber);
    sendData(res, toBillingDto(await insertRow(pool, billingsTable, data)), 201);
  });

  // Booking reimbursements is billing-scoped: the policy — and with it the set
  // of invoices that may be booked at all — follows from the billing, so the
  // client never has to repeat it per entry.
  router.post('/:uid/allocations', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const { entries } = allocationEntriesSchema.parse(req.body);
    sendData(res, await createAllocationsForBilling(pool, user.userId, uid, entries), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireBillingAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);
    const patch = updateSchema.parse(req.body);
    if (patch.billingNumber !== undefined) {
      const current = await getRow(pool, billingsTable, uid);
      if (current === null) throw notFound('Service billing');
      await assertBillingNumberFree(pool, current.contractUID, patch.billingNumber, uid);
    }
    const updated = await updateRow(pool, billingsTable, uid, patch);
    sendData(res, toBillingDto(updated));
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireBillingAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);

    // Cascade: detach the reimbursements first, so every invoice billed through
    // this Leistungsabrechnung falls back to "eingereicht" (the derived status
    // ignores soft-deleted allocations). Transactional, so a billing is never
    // left half-deleted with orphaned allocations.
    //
    // Billing and allocations are stamped with the SAME deletedAt: that shared
    // moment is what marks them as one deletion batch, so the trash brings the
    // reimbursements back together with the letter they belong to (Slice 39).
    await withTransaction(pool, async (conn) => {
      const at = await deletionTimestamp(conn);
      await conn.query(
        `UPDATE Allocations SET allocationStatus = -1, deletedAt = ?
          WHERE billingUID = ? AND allocationStatus <> -1`,
        [at, uid],
      );
      await conn.query(
        `UPDATE ServiceBillings SET billingStatus = -1, deletedAt = ?
          WHERE billingUID = ? AND billingStatus <> -1`,
        [at, uid],
      );
    });
    res.status(204).end();
  });

  return router;
}
