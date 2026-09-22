import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts, hasPermission } from '../auth/permissions.js';
import { forbidden } from '../auth/errors.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import {
  type CrudTable,
  type Queryable,
  insertRow,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { deriveInvoiceStatus, deriveSubmissionStatus } from './invoice-status.js';
import { accountForContract, accountForInvoice, authorizeAccount } from './workflow-access.js';

const table: CrudTable = {
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
  // date (see Notes/eunomia-plan.md, Slice 8).
  treatmentDate: z.string().date(),
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
  submittedDate: string;
  billingCount: number;
  allocationCount: number;
  reimbursed: number;
}

interface InvoiceExclusionRow {
  invoiceUID: string;
  contractUID: string;
  contractNumber: string;
  companyName: string;
  note: string | null;
}

/**
 * Enriched invoice query: the reimbursed total and allocation count over all
 * policies, plus whether any billing behind it has an open objection.
 */
async function queryInvoices(
  db: Queryable,
  where: string,
  params: unknown[],
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
      ORDER BY i.invoiceDate DESC, i.invoiceUID`,
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
 * Adds the per-policy submissions, the exclusions and the derived status to
 * enriched invoice rows. Two batched queries instead of widening the
 * aggregated main query, which would multiply its joins.
 */
async function present(db: Queryable, rows: InvoiceRow[]): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const uids = rows.map((row) => row.invoiceUID);
  const placeholders = uids.map(() => '?').join(', ');

  const submissions = byInvoice(
    await db.query<InvoiceSubmissionRow[]>(
      `SELECT si.invoiceUID, s.submissionUID, s.contractUID, c.contractNumber, v.companyName,
              s.submittedDate,
              COUNT(DISTINCT b.billingID) AS billingCount,
              COUNT(a.allocationID) AS allocationCount,
              COALESCE(SUM(a.reimbursement), 0) AS reimbursed
         FROM SubmissionInvoices si
         JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
         JOIN Contracts c ON c.contractUID = s.contractUID
         JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
         LEFT JOIN ServiceBillings b ON b.submissionUID = s.submissionUID AND b.billingStatus <> -1
         LEFT JOIN Allocations a
                ON a.billingUID = b.billingUID AND a.invoiceUID = si.invoiceUID
               AND a.allocationStatus <> -1
        WHERE si.invoiceUID IN (${placeholders})
        GROUP BY si.invoiceUID, s.submissionUID
        ORDER BY s.submittedDate, s.submissionUID`,
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
      reimbursementClosed: Boolean(row.reimbursementClosed),
      hasOpenObjection: Boolean(Number(row.hasOpenObjection)),
      ...status,
      submissions: invoiceSubmissions.map((s) => ({
        submissionUID: s.submissionUID,
        contractUID: s.contractUID,
        contractNumber: s.contractNumber,
        companyName: s.companyName,
        submittedDate: s.submittedDate,
        billingCount: s.billingCount,
        reimbursed: s.reimbursed,
        status: deriveSubmissionStatus(s.allocationCount),
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
    const where: string[] = ['i.invoiceStatus <> -1'];
    const params: unknown[] = [];

    const requestedAccount =
      typeof req.query.accountUID === 'string' ? req.query.accountUID : undefined;
    if (requestedAccount !== undefined) {
      if (!(await hasPermission(pool, user.userId, PERMISSIONS.VIEW_INVOICES, requestedAccount))) {
        throw forbidden();
      }
      where.push('i.accountUID = ?');
      params.push(requestedAccount);
    } else {
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

    const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
    if (year !== undefined && Number.isInteger(year)) {
      where.push('YEAR(i.treatmentDate) = ?');
      params.push(year);
    }

    const rows = await queryInvoices(pool, where.join(' AND '), params);
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
    const created = await insertRow(pool, table, data);
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
        );
      }
      if (data.reimbursementClosed === 1 && (await submissionCount(conn, uid)) === 0) {
        throw conflict('Only a submitted invoice can be marked as billed');
      }
      await updateRow(conn, table, uid, data);
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
      throw badRequest("The contract does not belong to the invoice's account");
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
        throw conflict('The invoice is already submitted to this contract');
      }
      const [existing] = await conn.query<Array<{ n: number }>>(
        'SELECT COUNT(*) AS n FROM InvoiceExclusions WHERE invoiceUID = ? AND contractUID = ?',
        [uid, data.contractUID],
      );
      if (Number(existing?.n ?? 0) > 0) {
        throw conflict('The invoice is already marked as not reimbursable under this contract');
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
    await softDeleteRow(pool, table, uid);
    res.status(204).end();
  });

  return router;
}
