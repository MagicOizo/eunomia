import type { RecordKind, RetentionKind } from '@eunomia/shared';

import { activeLanguage } from './format';
import { i18n } from './i18n';

/**
 * The names of the kinds of record (`RECORD_KINDS`, @eunomia/shared) — "Rechnung",
 * "Police", "Versicherter" — for every place that names one: the master data
 * lists, the trash, the error sentences of a refused restore (Slice 79).
 *
 * English writes these in lower case inside a sentence ("Create insured
 * person"), so the catalogue holds them that way and `kindTitle` adds the
 * capital where one starts a heading. Each table is a `Record` over its kind
 * and calls `t()` literally: a kind without a name does not compile.
 */

const { t } = i18n.global;

const KIND_NAMES: Record<RecordKind, (count: number) => string> = {
  account: (n) => t('kinds.account', n),
  company: (n) => t('kinds.company', n),
  contract: (n) => t('kinds.contract', n),
  premium: (n) => t('kinds.premium', n),
  contractTerms: (n) => t('kinds.contractTerms', n),
  facility: (n) => t('kinds.facility', n),
  agency: (n) => t('kinds.agency', n),
  agencyAccount: (n) => t('kinds.agencyAccount', n),
  submission: (n) => t('kinds.submission', n),
  invoice: (n) => t('kinds.invoice', n),
  serviceBilling: (n) => t('kinds.serviceBilling', n),
  allocation: (n) => t('kinds.allocation', n),
};

const COUNTED: Record<RetentionKind, (count: number) => string> = {
  account: (n) => t('kindCounts.account', n),
  company: (n) => t('kindCounts.company', n),
  contract: (n) => t('kindCounts.contract', n),
  premium: (n) => t('kindCounts.premium', n),
  contractTerms: (n) => t('kindCounts.contractTerms', n),
  facility: (n) => t('kindCounts.facility', n),
  agency: (n) => t('kindCounts.agency', n),
  agencyAccount: (n) => t('kindCounts.agencyAccount', n),
  submission: (n) => t('kindCounts.submission', n),
  invoice: (n) => t('kindCounts.invoice', n),
  serviceBilling: (n) => t('kindCounts.serviceBilling', n),
  allocation: (n) => t('kindCounts.allocation', n),
  user: (n) => t('kindCounts.user', n),
};

/**
 * The name of a kind — "Rechnung", or with `count` other than 1 "Rechnungen".
 * A kind this build does not know (a newer API) reads as the generic "Eintrag".
 */
export function kindName(kind: string, count = 1): string {
  const name = KIND_NAMES[kind as RecordKind] as ((n: number) => string) | undefined;
  return name ? name(count) : t('common.entry');
}

/**
 * The same name at the head of a heading or sentence. German nouns are capital
 * anyway; English writes a kind in lower case inside a sentence ("Restore
 * service billing") and needs the capital only here.
 */
export function kindTitle(kind: string, count = 1): string {
  return capitalized(kindName(kind, count));
}

/** The text with its first letter in upper case. */
export function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase(activeLanguage()) + text.slice(1);
}

/** "3 Rechnungen" — a number of records of one kind, inside a sentence. */
export function countedKind(kind: string, count: number): string {
  const name = COUNTED[kind as RetentionKind] as ((n: number) => string) | undefined;
  return name ? name(count) : String(count);
}
