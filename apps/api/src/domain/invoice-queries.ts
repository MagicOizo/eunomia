/**
 * Everything the invoice endpoints ask the database, and the shape in which an
 * invoice leaves the API: the table description, the row types, the enriched
 * query and the presentation layer that turns rows into the DTO the web reads.
 *
 * "Queries" is the short name for it; the handful of writes an invoice needs
 * beside its CRUD row — the treatment days — live here too, because they are
 * database access and a third file for ten lines would cost more than the
 * imprecision in the name.
 */

import { ERROR_CODES } from '@eunomia/shared';

import type { CrudTable, Queryable } from '../crud/repository.js';
import { conflict } from '../lib/api-error.js';
import {
  type NotCovered,
  type PaymentDetailChoice,
  type TreatmentDays,
  nextPaymentDetail,
} from './invoice-rules.js';
import { deriveInvoiceStatus, deriveSubmissionStatus } from './invoice-status.js';

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
    'agencyAccountUID',
    'directPayment',
    'reimbursementClosed',
    'notCovered',
    'notCoveredReason',
  ],
};

/**
 * The invoice's own columns for the enriched query, prefixed for its `i` alias.
 * Derived from the table description so the two lists cannot drift apart: the
 * UID in front and the status behind are the two columns CRUD manages itself
 * and that `invoicesTable.columns` therefore does not name.
 */
const INVOICE_COLUMNS = ['invoiceUID', ...invoicesTable.columns, 'invoiceStatus']
  .map((c) => `i.${c}`)
  .join(', ');

export type InvoiceRow = Record<string, unknown> & {
  invoiceUID: string;
  invoiceAmount: number;
  transferDate: string | null;
  reimbursementClosed: number;
  notCovered: number;
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
export async function queryInvoices(
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
export async function present(
  db: Queryable,
  rows: InvoiceRow[],
): Promise<Record<string, unknown>[]> {
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
      directPayment: Boolean(row.directPayment),
      reimbursementClosed: Boolean(row.reimbursementClosed),
      notCovered: Boolean(row.notCovered),
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

export async function presentOne(db: Queryable, row: InvoiceRow): Promise<Record<string, unknown>> {
  const [presented] = await present(db, [row]);
  return presented as Record<string, unknown>;
}

export async function getInvoice(db: Queryable, uid: string): Promise<InvoiceRow | null> {
  const rows = await queryInvoices(db, 'i.invoiceUID = ? AND i.invoiceStatus <> -1', [uid]);
  return rows[0] ?? null;
}

/** The treatment days of an invoice, earliest first. */
export async function treatmentDaysOf(db: Queryable, invoiceUID: string): Promise<string[]> {
  const rows = await db.query<Array<{ treatmentDate: string }>>(
    'SELECT treatmentDate FROM InvoiceTreatmentDays WHERE invoiceUID = ? ORDER BY treatmentDate',
    [invoiceUID],
  );
  return rows.map((row) => row.treatmentDate);
}

/** The mark as it stands on an invoice row. */
export function notCoveredOf(row: InvoiceRow): NotCovered {
  return {
    notCovered: Number(row.notCovered),
    notCoveredReason: (row.notCoveredReason as string | null) ?? null,
  };
}

/** Throws 409 unless the payment details are an active set of that agency. */
async function assertPaymentDetailOfAgency(
  db: Queryable,
  agencyUID: string,
  agencyAccountUID: string,
): Promise<void> {
  const rows = await db.query<Array<{ uid: string }>>(
    `SELECT agencyAccountUID AS uid FROM AgencyBankAccounts
      WHERE agencyAccountUID = ? AND agencyUID = ? AND agencyAccountStatus <> -1`,
    [agencyAccountUID, agencyUID],
  );
  if (rows.length === 0) {
    throw conflict('The bank account does not belong to the collection agency of the invoice', {
      code: ERROR_CODES.INVOICE_ACCOUNT_NOT_OF_AGENCY,
    });
  }
}

/**
 * Resolves the payment details for a write and checks they belong to the agency.
 * Both write paths do the same two steps, and forgetting the check would let an
 * invoice point at a stranger's account.
 */
export async function resolvePaymentDetail(
  db: Queryable,
  data: { agencyUID?: string | null; agencyAccountUID?: string | null; directPayment?: number },
  current: { agencyUID: string | null; directPayment: number },
): Promise<PaymentDetailChoice | null> {
  const choice = nextPaymentDetail(data, current);
  const agencyUID = data.agencyUID === undefined ? current.agencyUID : data.agencyUID;
  if (choice?.agencyAccountUID != null && agencyUID !== null) {
    await assertPaymentDetailOfAgency(db, agencyUID, choice.agencyAccountUID);
  }
  return choice;
}

/** Replaces the treatment days of an invoice; the caller has checked them. */
export async function writeTreatmentDays(
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

export async function submissionCount(db: Queryable, invoiceUID: string): Promise<number> {
  const [row] = await db.query<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n
       FROM SubmissionInvoices si
       JOIN Submissions s ON s.submissionUID = si.submissionUID AND s.submissionStatus <> -1
      WHERE si.invoiceUID = ?`,
    [invoiceUID],
  );
  return Number(row?.n ?? 0);
}
