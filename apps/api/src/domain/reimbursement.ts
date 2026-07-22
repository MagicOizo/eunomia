/**
 * The "is it worth submitting?" calculation (see Notes/eunomia-plan.md, 1.1
 * and Slice 5). Kept as a pure function so the business rules are unit-tested
 * in isolation rather than hidden inside a SQL sub-query.
 *
 * The model per contract and year:
 *  - The insured pays the annual `deductible` (Selbstbeteiligung) themselves;
 *    only the amount above it is reimbursable.
 *  - `cap` (reimbursementCap) is the most the insurer reimburses in total for
 *    the year, regardless of the deductible. `null` means no cap.
 *  - `bonus` is paid at year-end only if NOTHING was submitted that year.
 *
 * Submitting therefore only pays off when the reimbursement it would yield is
 * greater than the bonus it forfeits: net cost without submitting is
 * `total - bonus`, with submitting `total - reimbursement`, so submitting wins
 * exactly when `reimbursement > bonus`.
 */

export interface ReimbursementInput {
  /** Annual deductible (Selbstbeteiligung). */
  deductible: number;
  /** Year-end bonus forfeited by submitting anything. */
  bonus: number;
  /** Annual reimbursement cap, or null for no cap. */
  cap: number | null;
  /** Total of the invoices under consideration for the year. */
  invoiceTotal: number;
}

export interface ReimbursementResult {
  /** Amount the insurer would reimburse for `invoiceTotal` (after deductible, capped). */
  reimbursement: number;
  /** True when submitting yields more than the forfeited bonus. */
  worthSubmitting: boolean;
  /** True when the cap (not the raw invoice total) limits the reimbursement. */
  cappedOut: boolean;
  /**
   * Invoice total at which reimbursement first equals the bonus (break-even),
   * or null when the cap makes submitting never worthwhile.
   */
  breakEvenInvoiceTotal: number | null;
  /**
   * How much more invoice total is needed to reach break-even (0 once past it),
   * or null when break-even is unreachable because of the cap.
   */
  shortfallToBreakEven: number | null;
}

/** Rounds to whole cents to keep DECIMAL(x,2) money arithmetic exact. */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Evaluates whether submitting the given invoice total is worthwhile. */
export function evaluateReimbursement(input: ReimbursementInput): ReimbursementResult {
  const { deductible, bonus, cap, invoiceTotal } = input;

  const eligible = Math.max(invoiceTotal - deductible, 0);
  const reimbursement = roundCents(cap === null ? eligible : Math.min(eligible, cap));
  const cappedOut = cap !== null && eligible > cap;
  const worthSubmitting = reimbursement > bonus;

  // With the cap in force the reimbursement can never exceed `cap`; if that
  // ceiling does not clear the bonus, no invoice total ever makes it worthwhile.
  const capNeverClearsBonus = cap !== null && cap <= bonus;
  const breakEvenInvoiceTotal = capNeverClearsBonus ? null : roundCents(deductible + bonus);
  const shortfallToBreakEven =
    breakEvenInvoiceTotal === null ? null : roundCents(Math.max(breakEvenInvoiceTotal - invoiceTotal, 0));

  return { reimbursement, worthSubmitting, cappedOut, breakEvenInvoiceTotal, shortfallToBreakEven };
}
