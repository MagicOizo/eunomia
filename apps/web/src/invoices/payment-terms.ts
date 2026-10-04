import { isoPlusDays } from '../lib/date-input';
import { germanDate } from '../lib/format';

/**
 * The payment terms a bill usually names (issues.md 0.15.0-2).
 *
 * Some bills state a due date, others only "within 14 days" — and in practice
 * it is those three steps beside "immediately". So the create form offers them
 * as suggestions and nothing more: picking one fills the date field, and from
 * then on the date is the value. There is no payment term in the data model and
 * none at the agency, which is a decision rather than an omission (author,
 * 2026-10-04): a suggestion that is stored becomes a rule, and the next bill of
 * the same agency would then carry a due date nobody read off it.
 *
 * For the same reason nothing here recomputes: correcting the invoice date later
 * leaves a chosen due date alone. The suggestions are built from whatever the
 * invoice date says at the moment the list is opened, and the user picks again
 * if that is what they want.
 */

/**
 * The steps, in days after the invoice date. `0` is the invoice date itself —
 * payable at once, which is not the same as the "Direkt-/Barzahlung" switch:
 * that one says the bill is already settled.
 */
export const PAYMENT_TERM_DAYS = [0, 14, 15, 30];

export interface PaymentTermSuggestion {
  /** The due date this step works out to, as ISO text for the date field. */
  value: string;
  /** The step itself, as the list names it. */
  label: string;
  /** The date it works out to, written the way this country writes it. */
  hint: string;
}

/** The step's name: "sofort" for the invoice date itself, otherwise "14 Tage". */
function termLabel(days: number): string {
  return days === 0 ? 'sofort' : `${days} Tage`;
}

/**
 * The suggestions for an invoice dated `invoiceDate`, or none at all while that
 * date is missing or half-typed — every step is counted from it, so without it
 * there is nothing to suggest.
 */
export function paymentTermSuggestions(invoiceDate: string): PaymentTermSuggestion[] {
  const suggestions: PaymentTermSuggestion[] = [];
  for (const days of PAYMENT_TERM_DAYS) {
    const due = isoPlusDays(invoiceDate, days);
    if (due === null) return [];
    suggestions.push({ value: due, label: termLabel(days), hint: germanDate(due) });
  }
  return suggestions;
}
