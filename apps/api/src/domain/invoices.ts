/**
 * The invoice endpoints: the zod schemas that say what a write may carry, and
 * the router that applies them. The rules a write has to obey live in
 * `invoice-rules.ts`, everything the endpoints ask the database in
 * `invoice-queries.ts`.
 */

import { ERROR_CODES, isHttpUrl, PERMISSIONS, STATUS_FILTERS } from '@eunomia/shared';
import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { forbidden } from '../auth/errors.js';
import { createRequireAuth, getAuthUser } from '../auth/middleware.js';
import { accountFilter, hasPermission } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { parseQuery, pathParam } from '../crud/params.js';
import { execute, insertRow, softDeleteRow, updateRow } from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../lib/api-error.js';
import { ENTITY_PREFIX, entityIdPattern } from '../lib/ids.js';
import { likeTerm } from '../lib/like.js';
import {
  getInvoice,
  invoicesTable,
  notCoveredOf,
  present,
  presentOne,
  queryInvoices,
  requireInvoice,
  resolvePaymentDetail,
  submissionCount,
  treatmentDaysOf,
  writeTreatmentDays,
} from './invoice-queries.js';
import {
  assertOneYear,
  nextNotCovered,
  nextPaymentDates,
  nextTreatmentDays,
} from './invoice-rules.js';
import { matchesStatus } from './invoice-status.js';
import { accountForContract, authorizeAccount, requireInvoiceAccount } from './workflow-access.js';

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
  // `.url()` asks whether this is an address, `isHttpUrl` whether a browser may
  // follow it: zod's URL check takes `javascript:` and `data:` too (SEC-01).
  documentLink: z.string().trim().url().max(255).refine(isHttpUrl).nullish(),
  agencyUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.agency)).nullish(),
  /**
   * Which payment details of that agency the invoice goes to (Slice 44). An
   * agency holds several sets at once, so the invoice names one instead of a
   * rule guessing it — see `nextPaymentDetail()`.
   */
  agencyAccountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.agencyAccount)).nullish(),
  directPayment: flag.optional(),
  /**
   * "The insurance does not cover this" (Slice 42): the invoice is never
   * submitted and counts towards no deductible. The reason is mandatory while
   * the flag is set and is dropped with it — see `nextNotCovered()`.
   */
  notCovered: flag.optional(),
  notCoveredReason: z.string().trim().min(1).max(255).nullish(),
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
 *
 * The reference filters — agency, one of its bank accounts, provider — answer
 * "which invoices use this one?" (issues.md 0.12.0-5). Each is a plain equality
 * on a column of the invoice, so a further one is this field plus its `if`
 * block below. `status` is the odd one out: it is derived, never stored, and
 * therefore applied after the rows were presented.
 */
const listQuery = z.object({
  accountUID: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(1900).max(2999).optional(),
  /** Substring of the invoice number; deliberately nothing else. */
  q: z.string().trim().min(1).max(50).optional(),
  agencyUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.agency)).optional(),
  agencyAccountUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.agencyAccount)).optional(),
  facilityUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.facility)).optional(),
  status: z.enum(STATUS_FILTERS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** The year tabs take the account filter of `listQuery` and nothing else. */
const yearsQuery = listQuery.pick({ accountUID: true });

/**
 * How many rows a status-filtered list reads before narrowing them down. The
 * filter cannot run in SQL (see `listQuery`), so `limit` has to be applied
 * afterwards — this cap keeps such a query bounded all the same. A household's
 * archive stays far below it; if it ever did not, the answer is a narrower
 * filter, not a longer list.
 */
const STATUS_SCAN_CAP = 1000;

const exclusionSchema = z.object({
  contractUID: z.string().regex(entityIdPattern(ENTITY_PREFIX.contract)),
  note: z.string().trim().min(1).max(255).nullish(),
});

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
        throw forbidden(PERMISSIONS.VIEW_INVOICES, requestedAccount);
      }
      where.push('i.accountUID = ?');
      params.push(requestedAccount);
    } else {
      // Without an account the search runs over everything the user may see —
      // the same scoping the billings search uses (service-billings.ts).
      const accountScope = await accountFilter(
        pool,
        user.userId,
        PERMISSIONS.VIEW_INVOICES,
        'i.accountUID',
      );
      if (accountScope === null) {
        sendData(res, []);
        return;
      }
      where.push(accountScope.clause);
      params.push(...accountScope.params);
    }

    if (filters.year !== undefined) {
      where.push('YEAR(i.treatmentDate) = ?');
      params.push(filters.year);
    }

    if (filters.q !== undefined) {
      where.push("i.invoiceNumber LIKE ? ESCAPE '!'");
      params.push(likeTerm(filters.q));
    }

    // The reference filters, one block each — the pattern a further one copies.
    if (filters.agencyUID !== undefined) {
      where.push('i.agencyUID = ?');
      params.push(filters.agencyUID);
    }

    if (filters.agencyAccountUID !== undefined) {
      where.push('i.agencyAccountUID = ?');
      params.push(filters.agencyAccountUID);
    }

    if (filters.facilityUID !== undefined) {
      where.push('i.facilityUID = ?');
      params.push(filters.facilityUID);
    }

    // With a status filter the limit belongs to what the filter leaves over, so
    // the query reads up to the cap and the list is cut to size afterwards.
    const status = filters.status;
    const rows = await queryInvoices(
      pool,
      where.join(' AND '),
      params,
      status === undefined ? filters.limit : STATUS_SCAN_CAP,
    );
    const presented = await present(pool, rows);
    if (status === undefined) {
      sendData(res, presented);
      return;
    }
    const matching = presented.filter((invoice) => matchesStatus(invoice.workflowStatus, status));
    sendData(res, filters.limit === undefined ? matching : matching.slice(0, filters.limit));
  });

  // Distinct treatment years for an account, so the UI can offer year tabs
  // without loading every invoice. Registered before '/:uid' so it is not
  // captured as an invoice id.
  router.get('/years', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const where: string[] = ['invoiceStatus <> -1'];
    const params: unknown[] = [];

    const { accountUID: requestedAccount } = parseQuery(req, yearsQuery);
    if (requestedAccount !== undefined) {
      if (!(await hasPermission(pool, user.userId, PERMISSIONS.VIEW_INVOICES, requestedAccount))) {
        throw forbidden(PERMISSIONS.VIEW_INVOICES, requestedAccount);
      }
      where.push('accountUID = ?');
      params.push(requestedAccount);
    } else {
      const accountScope = await accountFilter(
        pool,
        user.userId,
        PERMISSIONS.VIEW_INVOICES,
        'accountUID',
      );
      if (accountScope === null) {
        sendData(res, []);
        return;
      }
      where.push(accountScope.clause);
      params.push(...accountScope.params);
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
    await authorizeAccount(pool, user.userId, PERMISSIONS.VIEW_INVOICES, invoice.accountUID);
    sendData(res, await presentOne(pool, invoice));
  });

  router.post('/', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const data = base.parse(req.body);
    await authorizeAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, data.accountUID);
    // `treatmentDate` is mandatory here, so there is always a day to write.
    const days = nextTreatmentDays(data, []);
    assertOneYear(days);
    // A new invoice is submitted nowhere, so only the reason rule can bite.
    const mark = nextNotCovered(data, { notCovered: 0, notCoveredReason: null });
    const paid = nextPaymentDates(data, { directPayment: 0, invoiceDate: data.invoiceDate });
    const paymentDetail = await resolvePaymentDetail(pool, data, {
      agencyUID: null,
      directPayment: 0,
    });
    const created = await withTransaction(pool, async (conn) => {
      // The stored `treatmentDate` is the earliest day, never just the one
      // that happened to be typed first.
      const row = await insertRow(conn, invoicesTable, {
        ...data,
        ...(mark ?? {}),
        ...(paid ?? {}),
        ...(paymentDetail ?? {}),
        treatmentDate: days[0],
      });
      await writeTreatmentDays(conn, row.invoiceUID, days);
      return row;
    });
    sendData(res, await presentOne(pool, await requireInvoice(pool, created.invoiceUID)), 201);
  });

  router.patch('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireInvoiceAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);
    const data = updateSchema.parse(req.body);

    await withTransaction(pool, async (conn) => {
      // Locks the invoice row so a concurrent allocation cannot slip in
      // between the checks and the update (the allocation path locks it too).
      await conn.query('SELECT invoiceUID FROM Invoices WHERE invoiceUID = ? FOR UPDATE', [uid]);
      const current = await requireInvoice(conn, uid);
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
      // "Not covered" means "will never be submitted", so it is only for an
      // invoice that has not been (decided by the author, 2026-09-28) — the
      // same line the per-policy mark draws. After a refusal the way round is
      // to withdraw first, or to mark it at that one policy.
      const mark = nextNotCovered(data, notCoveredOf(current));
      if (mark?.notCovered === 1 && (await submissionCount(conn, uid)) > 0) {
        throw conflict('An invoice that is already submitted cannot be marked as not covered', {
          code: ERROR_CODES.INVOICE_NOT_COVERED_SUBMITTED,
        });
      }
      const paid = nextPaymentDates(data, {
        directPayment: Number(current.directPayment),
        invoiceDate: current.invoiceDate,
      });
      const paymentDetail = await resolvePaymentDetail(conn, data, {
        agencyUID: current.agencyUID,
        directPayment: Number(current.directPayment),
      });
      const patch = { ...data, ...(mark ?? {}), ...(paid ?? {}), ...(paymentDetail ?? {}) };
      const days = nextTreatmentDays(data, await treatmentDaysOf(conn, uid));
      if (days === null) {
        await updateRow(conn, invoicesTable, uid, patch);
      } else {
        assertOneYear(days);
        await updateRow(conn, invoicesTable, uid, { ...patch, treatmentDate: days[0] });
        await writeTreatmentDays(conn, uid, days);
      }
    });

    sendData(res, await presentOne(pool, await requireInvoice(pool, uid)));
  });

  // "Not reimbursable under this policy" marks. Keyed by (invoice, policy),
  // so they have no UID of their own and are removed by the policy's UID.
  router.post('/:uid/exclusions', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    const account = await requireInvoiceAccount(
      pool,
      user.userId,
      PERMISSIONS.MANAGE_INVOICES,
      uid,
    );
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

    sendData(res, await presentOne(pool, await requireInvoice(pool, uid)), 201);
  });

  router.delete('/:uid/exclusions/:contractUID', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireInvoiceAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);
    const result = await execute(
      pool,
      'DELETE FROM InvoiceExclusions WHERE invoiceUID = ? AND contractUID = ?',
      [uid, pathParam(req, 'contractUID')],
    );
    if (result.affectedRows === 0) throw notFound('Exclusion');
    res.status(204).end();
  });

  router.delete('/:uid', requireAuth, async (req, res) => {
    const user = getAuthUser(res);
    const uid = pathParam(req, 'uid');
    await requireInvoiceAccount(pool, user.userId, PERMISSIONS.MANAGE_INVOICES, uid);
    await softDeleteRow(pool, invoicesTable, uid);
    res.status(204).end();
  });

  return router;
}
