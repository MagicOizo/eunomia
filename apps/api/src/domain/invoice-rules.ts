/**
 * The five rules an invoice write has to obey (Slices 41-44), as pure
 * functions: treatment days, the "not covered" mark, the two transfer dates
 * and the payment details of the collection agency.
 *
 * They live apart from the router and the database because they are the
 * places where the subject matter changes, and because they are the parts
 * worth testing on their own (`invoice-rules.test.ts`). Each `next*` function
 * answers the same question — what does this write leave behind? — and returns
 * `null` when the write says nothing about its fields and they are left alone.
 */

import { ERROR_CODES } from '@eunomia/shared';

import { badRequest } from '../lib/api-error.js';

/** An invoice always has at least one treatment day, and the first is the earliest. */
export type TreatmentDays = [string, ...string[]];

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
 *
 * The first signature is for the create path, where the schema makes
 * `treatmentDate` mandatory: there is always a day, so the answer is never
 * `null` — which used to be said with an assertion at the call site.
 */
export function nextTreatmentDays(
  data: { treatmentDate: string; treatmentDates?: string[] },
  current: string[],
): TreatmentDays;
export function nextTreatmentDays(
  data: { treatmentDate?: string; treatmentDates?: string[] },
  current: string[],
): TreatmentDays | null;
export function nextTreatmentDays(
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
export function assertOneYear(days: string[]): void {
  const years = [...new Set(days.map((day) => day.slice(0, 4)))];
  if (years.length > 1) {
    throw badRequest('All treatment days of an invoice must fall in the same calendar year', {
      code: ERROR_CODES.TREATMENT_DAYS_DIFFERENT_YEARS,
      details: { years },
    });
  }
}

/** The "not covered" mark of an invoice: the flag and the reason for it. */
export interface NotCovered {
  notCovered: number;
  notCoveredReason: string | null;
}

/**
 * What a write leaves behind for the "not covered" mark (Slice 42), or `null`
 * when it says nothing about either field and the mark is left alone.
 *
 * Two rules live here, because both masks and every other client have to obey
 * them alike:
 *
 *  - the reason is mandatory while the flag is set — it is the whole point of
 *    the mark, the sentence that says months later why the invoice was put
 *    aside;
 *  - clearing the flag clears the reason. A reason without a flag would be a
 *    dead entry that the masks would still have to show.
 */
export function nextNotCovered(
  data: { notCovered?: number; notCoveredReason?: string | null },
  current: NotCovered,
): NotCovered | null {
  if (data.notCovered === undefined && data.notCoveredReason === undefined) return null;
  const flagged = (data.notCovered ?? current.notCovered) === 1;
  if (!flagged) return { notCovered: 0, notCoveredReason: null };
  const reason =
    data.notCoveredReason === undefined ? current.notCoveredReason : data.notCoveredReason;
  if (reason === null || reason === '') {
    throw badRequest('A reason is required to mark an invoice as not covered', {
      code: ERROR_CODES.INVOICE_NOT_COVERED_REASON_REQUIRED,
    });
  }
  return { notCovered: 1, notCoveredReason: reason };
}

/** The two transfer dates of an invoice: when it is due, and when it was paid. */
export interface PaymentDates {
  transferUntilDate: string | null;
  transferDate: string | null;
}

/**
 * What a write leaves behind for the two transfer dates (Slice 43), or `null`
 * when it leaves them alone.
 *
 * A direct payment is the bill settled on the spot — cash at the counter, card
 * at the practice. Nothing is transferred and nothing is waited for, so both
 * dates are the invoice date and the invoice counts as paid the moment it is
 * entered. The rule lives here and not in the masks: the create form and the
 * detail mask both write `directPayment`, and a rule in one of them would let
 * the two drift apart.
 *
 *  - the flag stands after the write → both dates ARE the invoice date, so a
 *    corrected invoice date takes them with it;
 *  - the write drops the flag and says nothing about either date → both are
 *    cleared. "Paid on the invoice date" would otherwise stay behind as a
 *    statement nobody made. A date sent along with the same write wins.
 */
export function nextPaymentDates(
  data: {
    directPayment?: number;
    invoiceDate?: string;
    transferUntilDate?: string | null;
    transferDate?: string | null;
  },
  current: { directPayment: number; invoiceDate: string },
): PaymentDates | null {
  if ((data.directPayment ?? current.directPayment) === 1) {
    const paidOn = data.invoiceDate ?? current.invoiceDate;
    return { transferUntilDate: paidOn, transferDate: paidOn };
  }
  // Only the write that actually drops the flag clears the dates; for an
  // invoice that was never a direct payment they are the user's own.
  if (data.directPayment === undefined || current.directPayment !== 1) return null;
  return {
    transferUntilDate: data.transferUntilDate ?? null,
    transferDate: data.transferDate ?? null,
  };
}

/** Which payment details an invoice is paid on, after a write. */
export interface PaymentDetailChoice {
  agencyAccountUID: string | null;
}

/**
 * What a write leaves behind for the invoice's payment details (Slice 44), or
 * `null` when it leaves them alone.
 *
 * A collection agency holds several sets at the same time, so nothing can derive
 * which one an invoice goes to — it names it. The rules are about keeping that
 * name from pointing somewhere it does not belong:
 *
 *  - no agency after the write, or the bill was settled directly → there is
 *    nothing to transfer to, so the details go with the agency;
 *  - the write moves the invoice to another agency without naming details →
 *    they are cleared, because the old ones belong to the old agency;
 *  - the write names a set → it stands, and the caller checks that it is one of
 *    that agency's (`assertPaymentDetailOfAgency`, which needs the database).
 */
export function nextPaymentDetail(
  data: { agencyUID?: string | null; agencyAccountUID?: string | null; directPayment?: number },
  current: { agencyUID: string | null; directPayment: number },
): PaymentDetailChoice | null {
  const agencyUID = data.agencyUID === undefined ? current.agencyUID : data.agencyUID;
  if (agencyUID === null || (data.directPayment ?? current.directPayment) === 1) {
    return { agencyAccountUID: null };
  }
  if (data.agencyAccountUID !== undefined) return { agencyAccountUID: data.agencyAccountUID };
  return agencyUID === current.agencyUID ? null : { agencyAccountUID: null };
}
