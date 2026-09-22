import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { PERMISSIONS, getAccessibleAccounts, hasPermission } from '../auth/permissions.js';
import { forbidden } from '../auth/errors.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import { type CrudTable, insertRow, softDeleteRow, updateRow } from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { accountForInvoice, authorizeAccount } from './workflow-access.js';

const table: CrudTable = {
  table: 'Invoices',
  uidColumn: 'invoiceUID',
  statusColumn: 'invoiceStatus',
  entity: 'invoice',
  // submissionUID is intentionally NOT writable here: it is set once, only via
  // the submission endpoint, which is what makes "an invoice cannot be
  // submitted twice" structural rather than a matter of application discipline.
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
  ],
};

const money = z.number().min(0).max(99999999.99);
const directPayment = z.boolean().transform((value) => (value ? 1 : 0));

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
  directPayment: directPayment.optional(),
});

// accountUID is immutable after creation (moving an invoice between insured
// persons is not a real operation and would need dual-account authorization).
const updateSchema = base.omit({ accountUID: true }).partial();

const INVOICE_COLUMNS = [
  'invoiceUID',
  'invoiceNumber',
  'invoiceDate',
  'treatmentDate',
  'accountUID',
  'facilityUID',
  'submissionUID',
  'invoiceAmount',
  'transferUntilDate',
  'transferDate',
  'transferSubject',
  'documentLink',
  'agencyUID',
  'directPayment',
  'invoiceStatus',
]
  .map((c) => `i.${c}`)
  .join(', ');

type InvoiceRow = Record<string, unknown> & {
  submissionUID: string | null;
  transferDate: string | null;
  allocationCount: number;
  hasOpenObjection: number;
};

/**
 * The derived workflow status (see Notes/eunomia-plan.md, 2.3): never stored,
 * always computed from whether the invoice was submitted, whether a service
 * billing has been allocated to it, and whether it has finally been settled.
 */
function workflowStatus(row: InvoiceRow): 'offen' | 'eingereicht' | 'abgerechnet' | 'erledigt' {
  if (row.submissionUID === null) return 'offen';
  if (row.allocationCount === 0) return 'eingereicht';
  return row.transferDate === null ? 'abgerechnet' : 'erledigt';
}

/** Adds the derived status to an enriched invoice row. */
function present(row: InvoiceRow): Record<string, unknown> {
  return {
    ...row,
    workflowStatus: workflowStatus(row),
    hasOpenObjection: Boolean(Number(row.hasOpenObjection)),
  };
}

/** Enriched invoice query: joins allocations for the reimbursed total + count. */
async function queryInvoices(pool: Pool, where: string, params: unknown[]): Promise<InvoiceRow[]> {
  return pool.query<InvoiceRow[]>(
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

async function getInvoice(pool: Pool, uid: string): Promise<InvoiceRow | null> {
  const rows = await queryInvoices(pool, 'i.invoiceUID = ? AND i.invoiceStatus <> -1', [uid]);
  return rows[0] ?? null;
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
    sendData(res, rows.map(present));
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
    sendData(res, present(invoice));
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, data.accountUID);
    const created = await insertRow(pool, table, data);
    const enriched = await getInvoice(pool, created.invoiceUID as string);
    sendData(res, present(enriched as InvoiceRow), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await accountForInvoice(pool, uid);
    if (account === null) throw notFound('Invoice');
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, account);
    const data = updateSchema.parse(req.body);
    await updateRow(pool, table, uid, data);
    sendData(res, present((await getInvoice(pool, uid)) as InvoiceRow));
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
