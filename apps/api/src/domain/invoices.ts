import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts, hasPermission } from '../auth/permissions.js';
import { forbidden } from '../auth/errors.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { parseQuery, pathParam } from '../crud/params.js';
import {
  type CrudTable,
  type Queryable,
  insertRow,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { deriveInvoiceStatus, deriveSubmissionStatus } from './invoice-status.js';
import { accountForContract, accountForInvoice, authorizeAccount } from './workflow-access.js';

export const invoicesTable: CrudTable = {
  table: 'Invoices',
  uidColumn: 'invoiceUID',
  statusColumn: 'invoiceStatus',
  entity: 'invoice',
  // Submissions are not columns of the invoice: they live in
  // SubmissionInvoices and are only written by the submission endpoints.
  columns: [
    'invoiceNumber',
    'invoiceDate',
    'treatmentDate',
    'accountUID',
    'facilityUID',
    'invoiceAmount',
    'transferUntilDate',
    'transferDate',
    'transferSubject',
    'documentLink',
    'agencyUID',
    'directPayment',
    'reimbursementClosed',
  ],
};

const money = z.number().min(0).max(99999999.99);
const flag = z.boolean().transform((value) => (value ? 1 : 0));

const base = z.object({
  invoiceNumber: z.string().trim().min(1).max(50),
  invoiceDate: z.string().date(),
  // Mandatory: the deductible/bonus year is keyed by treatment date, not billing
  // date (see Notes/eunomia-plan.md, Slice 8). It is the LEADING day; the whole
  // list lives in `treatmentDates` (Slice 41).
  treatmentDate: z.string().date(),
  /**
   * The complete list of treatment days, not "the further ones" (Slice 41).
   * Optional, so a client that knows nothing of it keeps working: leaving it
   * out means the invoice is billed for the one day in `treatmentDate`.
   */
  treatmentDates: z.array(z.string().date()).min(1).max(60).optional(),
  accountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.account)),
  facilityUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.facility)).nullish(),
  invoiceAmount: money,
  transferUntilDate: z.string().date().nullish(),
  transferDate: z.string().date().nullish(),
  transferSubject: z.string().trim().min(1).max(100).nullish(),
  documentLink: z.string().trim().url().max(255).nullish(),
  agencyUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.agency)).nullish(),
  directPayment: flag.optional(),
});

// accountUID is immutable after creation (moving an invoice between insured
// persons is not a real operation and would need dual-account authorization).
// reimbursementClosed only makes sense once the invoice was submitted, so it
// exists on update only.
const updateSchema = base
  .omit({ accountUID: true })
  .extend({ reimbursementClosed: flag })
  .partial();

/**
 * Filters for the invoice list. `accountUID` and `year` scope the workspace to
 * one insured person and one treatment year; `q` is the invoice-number search
 * that works without either of them (issues.md 6), so an invoice can be found
 * when only its number is known.
 */
const listQuery = z.object({
  accountUID: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(1900).max(2999).optional(),
  /** Substring of the invoice number; deliberately nothing else. */
  q: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const exclusionSchema = z.object({
  contractUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.contract)),
  note: z.string().trim().min(1).max(255).nullish(),
});

const INVOICE_COLUMNS = [
  'invoiceUID',
  'invoiceNumber',
  'invoiceDate',
  'treatmentDate',
  'accountUID',
  'facilityUID',
  'invoiceAmount',
  'transferUntilDate',
  'transferDate',
  'transferSubject',
  'documentLink',
  'agencyUID',
  'directPayment',
  'reimbursementClosed',
  'invoiceStatus',
]
  .map((c) => `i.${c}`)
  .join(', ');

type InvoiceRow = Record<string, unknown> & {
  invoiceUID: string;
  invoiceAmount: number;
  transferDate: string | null;
  reimbursementClosed: number;
  reimbursedTotal: number;
  allocationCount: number;
  hasOpenObjection: number;
};

interface InvoiceSubmissionRow {
  invoiceUID: string;
  submissionUID: string;
  contractUID: string;
  contractNumber: string;
  companyName: string;
  bonusForfeitRule: string;
  submittedDate: string;
  billingCount: number;
  allocationCount: number;
  reimbursed: number;
}

interface InvoiceTreatmentDayRow {
  invoiceUID: string;
  treatmentDate: string;
}

interface InvoiceExclusionRow {
  invoiceUID: string;
  contractUID: string;
  contractNumber: string;
  companyName: string;
  note: string | null;
}

interface InvoiceAllocationRow {
  invoiceUID: string;
  contractUID: string;
  allocationUID: string;
  billingUID: string;
  billingNumber: string;
  billingDate: string;
  receiptNumber: string | null;
  reimbursement: number;
  objectionOpen: number;
}

/**
 * Enriched invoice query: the reimbursed total and allocation count over all
 * policies, plus whether any billing behind it has an open objection.
 */
async function queryInvoices(
  db: Queryable,
  where: string,
  params: unknown[],
  limit?: number,
): Promise<InvoiceRow[]> {
  return db.query<InvoiceRow[]>(
    `SELECT ${INVOICE_COLUMNS},
            COALESCE(SUM(a.reimbursement), 0) AS reimbursedTotal,
            COUNT(a.allocationID) AS allocationCount,
            MAX(
              CASE WHEN b.objectionDate IS NOT NULL AND b.objectionResolvedDate IS NULL
                   THEN 1 ELSE 0 END
            ) AS hasOpenObjection
       FROM Invoices i
       LEFT JOIN Allocations a ON a.invoiceUID = i.invoiceUID AND a.allocationStatus <> -1
       LEFT JOIN ServiceBillings b ON b.billingUID = a.billingUID AND b.billingStatus <> -1
      WHERE ${where}
      GROUP BY i.invoiceID
      ORDER BY i.invoiceDate DESC, i.invoiceUID${
        // Safe to inline: zod has narrowed it to an integer within range.
        limit === undefined ? '' : ` LIMIT ${limit}`
      }`,
    params,
  );
}

/** Groups rows by invoiceUID. */
function byInvoice<T extends { invoiceUID: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.invoiceUID) ?? [];
    list.push(row);
    map.set(row.invoiceUID, list);
  }
  return map;
}

/**
 * Groups allocation rows per invoice *and* policy: a policy holds many
 * invoices, so the policy alone is not a unique bucket here.
 *
 * Since Slice 37 a billing belongs to the policy, not to one submission — yet
 * the cards are still drawn per submission. That keeps working because an
 * invoice reaches each policy at most once (UNIQUE (invoiceUID, contractUID),
 * migration 007): invoice + policy and invoice + submission name the same
 * bucket.
 */
function byInvoicePolicy(rows: InvoiceAllocationRow[]): Map<string, InvoiceAllocationRow[]> {
  const map = new Map<string, InvoiceAllocationRow[]>();
  for (const row of rows) {
    const key = `${row.invoiceUID}\u0000${row.contractUID}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

/**
 * Adds the per-policy submissions with their booked reimbursements, the
 * exclusions and the derived status to enriched invoice rows. Batched queries
 * instead of widening the aggregated main query, which would multiply its joins.
 */
async function present(db: Queryable, rows: InvoiceRow[]): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const uids = rows.map((row) => row.invoiceUID);
  const placeholders = uids.map(() => '?').join(', ');

  const submissions = byInvoice(
    await db.query<InvoiceSubmissionRow[]>(
      `SELECT si.invoiceUID, s.submissionUID, s.contractUID, c.contractNumber, v.companyName,
              c.bonusForfeitRule, s.submittedDate,
              COUNT(DISTINCT b.billingID) AS billingCount,
              COUNT(a.allocationID) AS allocationCount,
              COALESCE(SUM(a.reimbursement), 0) AS reimbursed
         FROM SubmissionInvoices si
         JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
         JOIN Contracts c ON c.contractUID = s.contractUID
         JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
         LEFT JOIN (Allocations a
                    JOIN ServiceBillings b
                      ON b.billingUID = a.billingUID AND b.billingStatus <> -1)
                ON a.invoiceUID = si.invoiceUID AND a.allocationStatus <> -1
               AND b.contractUID = si.contractUID
        WHERE si.invoiceUID IN (${placeholders})
        GROUP BY si.invoiceUID, s.submissionUID
        ORDER BY s.submittedDate, s.submissionUID`,
      uids,
    ),
  );
  // The invoice's share of each service billing, for the cards of the detail
  // dialog: which billing paid what, and whether it is under objection.
  const allocations = byInvoicePolicy(
    await db.query<InvoiceAllocationRow[]>(
      `SELECT a.invoiceUID, b.contractUID, a.allocationUID, a.billingUID,
              b.billingNumber, b.billingDate, a.receiptNumber, a.reimbursement,
              CASE WHEN b.objectionDate IS NOT NULL AND b.objectionResolvedDate IS NULL
                   THEN 1 ELSE 0 END AS objectionOpen
         FROM Allocations a
         JOIN ServiceBillings b ON b.billingUID = a.billingUID AND b.billingStatus <> -1
        WHERE a.invoiceUID IN (${placeholders}) AND a.allocationStatus <> -1
        ORDER BY b.billingDate, b.billingUID`,
      uids,
    ),
  );
  // The days the invoice bills, earliest first; `treatmentDate` is the first
  // of them (migration 014 fills the table for every invoice there is).
  const treatmentDays = byInvoice(
    await db.query<InvoiceTreatmentDayRow[]>(
      `SELECT invoiceUID, treatmentDate FROM InvoiceTreatmentDays
        WHERE invoiceUID IN (${placeholders})
        ORDER BY treatmentDate`,
      uids,
    ),
  );
  const exclusions = byInvoice(
    await db.query<InvoiceExclusionRow[]>(
      `SELECT x.invoiceUID, x.contractUID, c.contractNumber, v.companyName, x.note
         FROM InvoiceExclusions x
         JOIN Contracts c ON c.contractUID = x.contractUID
         JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
        WHERE x.invoiceUID IN (${placeholders})
        ORDER BY c.contractNumber`,
      uids,
    ),
  );

  return rows.map((row) => {
    const invoiceSubmissions = submissions.get(row.invoiceUID) ?? [];
    const status = deriveInvoiceStatus({
      invoiceAmount: row.invoiceAmount,
      reimbursedTotal: row.reimbursedTotal,
      allocationCount: row.allocationCount,
      submissionCount: invoiceSubmissions.length,
      reimbursementClosed: Boolean(row.reimbursementClosed),
      transferDate: row.transferDate,
    });
    return {
      ...row,
      treatmentDates: (treatmentDays.get(row.invoiceUID) ?? []).map((day) => day.treatmentDate),
      reimbursementClosed: Boolean(row.reimbursementClosed),
      hasOpenObjection: Boolean(Number(row.hasOpenObjection)),
      ...status,
      submissions: invoiceSubmissions.map((s) => ({
        submissionUID: s.submissionUID,
        contractUID: s.contractUID,
        contractNumber: s.contractNumber,
        companyName: s.companyName,
        bonusForfeitRule: s.bonusForfeitRule,
        submittedDate: s.submittedDate,
        billingCount: s.billingCount,
        reimbursed: s.reimbursed,
        status: deriveSubmissionStatus(s.allocationCount),
        allocations: (allocations.get(`${row.invoiceUID}\u0000${s.contractUID}`) ?? []).map(
          (a) => ({
            allocationUID: a.allocationUID,
            billingUID: a.billingUID,
            billingNumber: a.billingNumber,
            billingDate: a.billingDate,
            receiptNumber: a.receiptNumber,
            reimbursement: a.reimbursement,
            objectionOpen: Boolean(Number(a.objectionOpen)),
          }),
        ),
      })),
      exclusions: (exclusions.get(row.invoiceUID) ?? []).map((x) => ({
        contractUID: x.contractUID,
        contractNumber: x.contractNumber,
        companyName: x.companyName,
        note: x.note,
      })),
    };
  });
}

async function presentOne(db: Queryable, row: InvoiceRow): Promise<Record<string, unknown>> {
  const [presented] = await present(db, [row]);
  return presented as Record<string, unknown>;
}

async function getInvoice(db: Queryable, uid: string): Promise<InvoiceRow | null> {
  const rows = await queryInvoices(db, 'i.invoiceUID = ? AND i.invoiceStatus <> -1', [uid]);
  return rows[0] ?? null;
}

/** The treatment days of an invoice, earliest first. */
async function treatmentDaysOf(db: Queryable, invoiceUID: string): Promise<string[]> {
  const rows = await db.query<Array<{ treatmentDate: string }>>(
    'SELECT treatmentDate FROM InvoiceTreatmentDays WHERE invoiceUID = ? ORDER BY treatmentDate',
    [invoiceUID],
  );
  return rows.map((row) => row.treatmentDate);
}

/** An invoice always has at least one treatment day, and the first is the earliest. */
type TreatmentDays = [string, ...string[]];

/** Sorted and without duplicates: the days of an invoice are a set, not a list. */
function asDays(days: string[]): TreatmentDays {
  const [earliest, ...rest] = [...new Set(days)].sort();
  if (earliest === undefined) throw new Error('an invoice needs at least one treatment day');
  return [earliest, ...rest];
}

/**
 * The days a write leaves behind, read from what the request carries:
 *
 *  - `treatmentDates` given: it IS the list (a `treatmentDate` sent alongside
 *    joins it, which for the app's own masks is the same day anyway);
 *  - only `treatmentDate`: the leading day MOVES — the earliest day so far is
 *    replaced, the others stay. For a one-day invoice that is exactly what
 *    "the treatment date changed" has always meant, and a client that knows
 *    nothing of several days cannot drop one by accident;
 *  - neither (update only): `null`, the days are left alone.
 */
function nextTreatmentDays(
  data: { treatmentDate?: string; treatmentDates?: string[] },
  current: string[],
): TreatmentDays | null {
  if (data.treatmentDates !== undefined) {
    return asDays([...data.treatmentDates, ...(data.treatmentDate ? [data.treatmentDate] : [])]);
  }
  if (data.treatmentDate === undefined) return null;
  return asDays([...current.slice(1), data.treatmentDate]);
}

/**
 * Rejects days from different calendar years. Deductible and bonus are yearly
 * figures keyed by `YEAR(treatmentDate)`, so an invoice spanning the turn of
 * the year has no single year to count in; it is split into two invoices, and
 * nothing stops that — `invoiceNumber` carries neither a UNIQUE nor a
 * duplicate check, so the same number may stand twice.
 */
function assertOneYear(days: string[]): void {
  const years = [...new Set(days.map((day) => day.slice(0, 4)))];
  if (years.length > 1) {
    throw badRequest('All treatment days of an invoice must fall in the same calendar year', {
      code: ERROR_CODES.TREATMENT_DAYS_DIFFERENT_YEARS,
      details: { years },
    });
  }
}

/** Replaces the treatment days of an invoice; the caller has checked them. */
async function writeTreatmentDays(
  db: Queryable,
  invoiceUID: string,
  days: TreatmentDays,
): Promise<void> {
  await db.query('DELETE FROM InvoiceTreatmentDays WHERE invoiceUID = ?', [invoiceUID]);
  await db.query(
    `INSERT INTO InvoiceTreatmentDays (invoiceUID, treatmentDate)
     VALUES ${days.map(() => '(?, ?)').join(', ')}`,
    days.flatMap((day) => [invoiceUID, day]),
  );
}

async function submissionCount(db: Queryable, invoiceUID: string): Promise<number> {
  const [row] = await db.query<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n
       FROM SubmissionInvoices si
       JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
      WHERE si.invoiceUID = ?`,
    [invoiceUID],
  );
  return Number(row?.n ?? 0);
}

/** CRUD router for invoices, account-scoped via each invoice's account. */
export function createInvoicesRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);

  router.get('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const filters = parseQuery(req, listQuery);
    const where: string[] = ['i.invoiceStatus <> -1'];
    const params: unknown[] = [];

    const requestedAccount = filters.accountUID;
    if (requestedAccount !== undefined) {
      if (!(await hasPermission(pool, user.userId, PERMISSIONS.VIEW_INVOICES, requestedAccount))) {
        throw forbidden();
      }
      where.push('i.accountUID = ?');
      params.push(requestedAccount);
    } else {
      // Without an account the search runs over everything the user may see —
      // the same scoping the billings search uses (service-billings.ts).
      const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_INVOICES);
      if (!scope.all) {
        if (scope.accountUIDs.length === 0) {
          sendData(res, []);
          return;
        }
        where.push(`i.accountUID IN (${scope.accountUIDs.map(() => '?').join(', ')})`);
        params.push(...scope.accountUIDs);
      }
    }

    if (filters.year !== undefined) {
      where.push('YEAR(i.treatmentDate) = ?');
      params.push(filters.year);
    }

    if (filters.q !== undefined) {
      where.push('i.invoiceNumber LIKE ?');
      params.push(`%${filters.q}%`);
    }

    const rows = await queryInvoices(pool, where.join(' AND '), params, filters.limit);
    sendData(res, await present(pool, rows));
  });

  // Distinct treatment years for an account, so the UI can offer year tabs
  // without loading every invoice. Registered before '/:uid' so it is not
  // captured as an invoice id.
  router.get('/years', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const where: string[] = ['invoiceStatus <> -1'];
    const params: unknown[] = [];

    const requestedAccount =
      typeof req.query.accountUID === 'string' ? req.query.accountUID : undefined;
    if (requestedAccount !== undefined) {
      if (!(await hasPermission(pool, user.userId, PERMISSIONS.VIEW_INVOICES, requestedAccount))) {
        throw forbidden();
      }
      where.push('accountUID = ?');
      params.push(requestedAccount);
    } else {
      const scope = await getAccessibleAccounts(pool, user.userId, PERMISSIONS.VIEW_INVOICES);
      if (!scope.all) {
        if (scope.accountUIDs.length === 0) {
          sendData(res, []);
          return;
        }
        where.push(`accountUID IN (${scope.accountUIDs.map(() => '?').join(', ')})`);
        params.push(...scope.accountUIDs);
      }
    }

    const rows = await pool.query<Array<{ year: number }>>(
      `SELECT DISTINCT YEAR(treatmentDate) AS year FROM Invoices
        WHERE ${where.join(' AND ')} ORDER BY year DESC`,
      params,
    );
    sendData(
      res,
      rows.map((row) => row.year),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const invoice = await getInvoice(pool, pathParam(req, 'uid'));
    if (!invoice) throw notFound('Invoice');
    await authorizeAccount(
      pool,
      user.userId,
      PERMISSIONS.VIEW_INVOICES,
      invoice.accountUID as string,
    );
    sendData(res, await presentOne(pool, invoice));
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, data.accountUID);
    // `treatmentDate` is mandatory here, so there is always a day to write.
    const days = nextTreatmentDays(data, []) as TreatmentDays;
    assertOneYear(days);
    const created = await withTransaction(pool, async (conn) => {
      // The stored `treatmentDate` is the earliest day, never just the one
      // that happened to be typed first.
      const row = await insertRow(conn, invoicesTable, { ...data, treatmentDate: days[0] });
      await writeTreatmentDays(conn, row.invoiceUID as string, days);
      return row;
    });
    const enriched = await getInvoice(pool, created.invoiceUID as string);
    sendData(res, await presentOne(pool, enriched as InvoiceRow), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForInvoice(pool, uid);
    if (account === null) throw notFound('Invoice');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    const data = updateSchema.parse(req.body);

    await withTransaction(pool, async (conn) => {
      // Locks the invoice row so a concurrent allocation cannot slip in
      // between the checks and the update (the allocation path locks it too).
      await conn.query('SELECT invoiceUID FROM Invoices WHERE invoiceUID = ? FOR UPDATE', [uid]);
      const current = (await getInvoice(conn, uid)) as InvoiceRow;
      if (
        data.invoiceAmount !== undefined &&
        Math.round(data.invoiceAmount * 100) < Math.round(current.reimbursedTotal * 100)
      ) {
        throw conflict(
          'The invoice amount cannot be lower than the reimbursements allocated to it',
          { code: ERROR_CODES.INVOICE_AMOUNT_BELOW_REIMBURSED },
        );
      }
      if (data.reimbursementClosed === 1 && (await submissionCount(conn, uid)) === 0) {
        throw conflict('Only a submitted invoice can be marked as billed', {
          code: ERROR_CODES.INVOICE_NOT_SUBMITTED,
        });
      }
      const days = nextTreatmentDays(data, await treatmentDaysOf(conn, uid));
      if (days === null) {
        await updateRow(conn, invoicesTable, uid, data);
      } else {
        assertOneYear(days);
        await updateRow(conn, invoicesTable, uid, { ...data, treatmentDate: days[0] });
        await writeTreatmentDays(conn, uid, days);
      }
    });

    sendData(res, await presentOne(pool, (await getInvoice(pool, uid)) as InvoiceRow));
  });

  // "Not reimbursable under this policy" marks. Keyed by (invoice, policy),
  // so they have no UID of their own and are removed by the policy's UID.
  router.post('/:uid/exclusions', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForInvoice(pool, uid);
    if (account === null) throw notFound('Invoice');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    const data = exclusionSchema.parse(req.body);

    const contractAccount = await accountForContract(pool, data.contractUID);
    if (contractAccount === null) throw notFound('Contract');
    if (contractAccount !== account) {
      throw badRequest("The contract does not belong to the invoice's account", {
        code: ERROR_CODES.CONTRACT_ACCOUNT_MISMATCH,
      });
    }

    await withTransaction(pool, async (conn) => {
      await conn.query('SELECT invoiceUID FROM Invoices WHERE invoiceUID = ? FOR UPDATE', [uid]);
      const [submitted] = await conn.query<Array<{ n: number }>>(
        `SELECT COUNT(*) AS n
           FROM SubmissionInvoices si
           JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
          WHERE si.invoiceUID = ? AND si.contractUID = ?`,
        [uid, data.contractUID],
      );
      if (Number(submitted?.n ?? 0) > 0) {
        throw conflict('The invoice is already submitted to this contract', {
          code: ERROR_CODES.INVOICE_ALREADY_SUBMITTED,
        });
      }
      const [existing] = await conn.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM InvoiceExclusions WHERE invoiceUID = ? AND contractUID = ?',
        [uid, data.contractUID],
      );
      if (Number(existing?.n ?? 0) > 0) {
        throw conflict('The invoice is already marked as not reimbursable under this contract', {
          code: ERROR_CODES.INVOICE_ALREADY_EXCLUDED,
        });
      }
      await conn.query(
        'INSERT INTO InvoiceExclusions (invoiceUID, contractUID, note) VALUES (?, ?, ?)',
        [uid, data.contractUID, data.note ?? null],
      );
    });

    sendData(res, await presentOne(pool, (await getInvoice(pool, uid)) as InvoiceRow), 201);
  });

  router.delete('/:uid/exclusions/:contractUID', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForInvoice(pool, uid);
    if (account === null) throw notFound('Invoice');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    const result = (await pool.query(
      'DELETE FROM InvoiceExclusions WHERE invoiceUID = ? AND contractUID = ?',
      [uid, pathParam(req, 'contractUID')],
    )) as { affectedRows: number };
    if (result.affectedRows === 0) throw notFound('Exclusion');
    res.status(204).end();
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForInvoice(pool, uid);
    if (account === null) throw notFound('Invoice');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    await softDeleteRow(pool, invoicesTable, uid);
    res.status(204).end();
  });

  return router;
}
