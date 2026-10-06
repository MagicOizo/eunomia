import type { AttachedRowKind, TrashPart } from '@eunomia/shared';

import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { i18n } from '../lib/i18n';
import { capitalized, kindName } from '../lib/kind-names';

/**
 * The trash in words. The API names a deleted record by its kind and describes
 * it in parts (`TrashPart`, @eunomia/shared); the sentences are made here, in
 * the reader's language (Slice 79). The page, the error sentences of a refused
 * restore or purge and the retention report all read from this one place; the
 * names of the kinds themselves are shared with the rest of the app
 * (lib/kind-names.ts).
 *
 * The table below is a `Record` over its kind and calls `t()` literally, so a
 * kind without a name does not compile and the lint sees every key.
 */

const { t } = i18n.global;

const ATTACHED_ROWS: Record<AttachedRowKind, (count: number) => string> = {
  submissionInvoice: (n) => t('trash.attachedRows.submissionInvoice', n),
  invoiceExclusion: (n) => t('trash.attachedRows.invoiceExclusion', n),
  bonusTier: (n) => t('trash.attachedRows.bonusTier', n),
  contractYear: (n) => t('trash.attachedRows.contractYear', n),
  roleGrant: (n) => t('trash.attachedRows.roleGrant', n),
  reminder: (n) => t('trash.attachedRows.reminder', n),
};

/** "2 Zahlungserinnerungen" — rows that go along with a record but are none themselves. */
export function countedAttachedRows(kind: string, count: number): string {
  const name = ATTACHED_ROWS[kind as AttachedRowKind] as ((n: number) => string) | undefined;
  return name ? name(count) : String(count);
}

/** One part of a record's description, in the format in effect. */
export function partText(part: TrashPart): string {
  switch (part.type) {
    case 'text':
      return part.value;
    case 'date':
      return formatDate(part.value);
    case 'money':
      return formatMoney(part.value);
    case 'born':
      return t('trash.parts.born', { date: formatDate(part.date) });
    case 'policy':
      return t('trash.parts.policy', { number: part.number });
    case 'validFrom':
      return t('trash.parts.validFrom', { date: formatDate(part.date) });
    case 'validFromYear':
      return t('trash.parts.validFromYear', { year: part.year });
    case 'dated':
      return t('trash.parts.dated', { date: formatDate(part.date) });
    case 'premium':
      return part.bonusRelevant
        ? t('trash.parts.bonusRelevantPremium', { amount: formatMoney(part.amount) })
        : t('trash.parts.premium', { amount: formatMoney(part.amount) });
    case 'distance':
      return t('common.km', { km: formatNumber(part.km) });
    case 'invoice':
      return t('trash.parts.invoice', { number: part.number });
    case 'billing':
      return t('trash.parts.billing', { number: part.number });
    default: {
      // A part a newer API sends and this build does not know reads as nothing.
      const unknown: never = part;
      void unknown;
      return '';
    }
  }
}

/** A context line: its parts, joined. */
export function contextText(parts: readonly TrashPart[]): string {
  return parts
    .map(partText)
    .filter((text) => text !== '')
    .join(', ');
}

/** A record as a sentence names it: `Rechnung „R-1“` (inside a sentence). */
export function namedEntry(kind: string, label: TrashPart): string {
  return t('errors.namedEntry', { kind: kindName(kind), label: partText(label) });
}

/** A record in a list of what goes along: `Erstattung 50,00 €`. */
export function attachedRecord(kind: string, label: TrashPart): string {
  return capitalized(t('trash.attachedRecord', { kind: kindName(kind), label: partText(label) }));
}

/** Why a kind cannot be restored at all. */
export function notRestorableReason(kind: string): string {
  return kind === 'submission'
    ? t('trash.notRestorable.submission')
    : t('trash.notRestorable.other');
}

/** Whether a value from an error's details is a record the trash named. */
export function isTrashRef(value: unknown): value is { kind: string; label: TrashPart } {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as { kind?: unknown; label?: unknown };
  return (
    typeof ref.kind === 'string' &&
    typeof ref.label === 'object' &&
    ref.label !== null &&
    typeof (ref.label as { type?: unknown }).type === 'string'
  );
}
