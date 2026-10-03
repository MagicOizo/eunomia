/**
 * The payment details of a collection agency — IBAN, BIC, beneficiary and note:
 * several at once, in the order they were recorded (see Notes/eunomia-plan.md,
 * Slice 44). Which of them applies is not a rule the data answers: the invoice
 * names its own. What is shared is the one suggestion both sides make for a new
 * one, because that suggestion has changed once already (Slice 44 replaced a
 * validity history with "the first one").
 */

/**
 * The payment details to suggest for an agency: the ones recorded first. Where
 * an agency lists several, the first is the one it is normally paid on. Only a
 * suggestion — what counts is what the invoice names.
 */
export function defaultPaymentDetail<T>(details: T[]): T | null {
  return details[0] ?? null;
}
