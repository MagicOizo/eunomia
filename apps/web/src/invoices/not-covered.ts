/**
 * The "nicht gedeckt" mark of an invoice (Slice 42): what the two masks and the
 * list need of it, kept out of the components so they say it alike.
 *
 * The mark belongs to the invoice, not to a policy: a treatment the insurance
 * does not cover is not covered at a policy taken out later either. The reason
 * is what makes the mark worth anything months on, so it is mandatory while the
 * mark is set — a rule of the API, checked here as well so the dialog says it
 * before the round trip (see apps/api/src/domain/invoices.ts).
 */

import { describeCode } from '../lib/error-messages';
import type { InvoiceDto } from './api';

/**
 * What the API answers when the mark comes without a reason, looked up by its
 * error code (lib/error-messages.ts) so the dialog and the round trip word it
 * the same way. The fallback is unreachable while the code is mapped there.
 */
export function reasonRequiredMessage(): string {
  return (
    describeCode('INVOICE_NOT_COVERED_REASON_REQUIRED', {}) ??
    'Bitte eine Begründung angeben, warum die Rechnung nicht gedeckt ist.'
  );
}

/** The mark's tooltip in a list: the reason, which the API guarantees is there. */
export function notCoveredTitle(
  invoice: Pick<InvoiceDto, 'notCovered' | 'notCoveredReason'>,
): string {
  return invoice.notCoveredReason ?? 'Von der Versicherung nicht gedeckt.';
}
