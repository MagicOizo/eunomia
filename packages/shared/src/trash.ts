/**
 * The vocabulary of the Papierkorb (Slice 39) that both sides spell. The API
 * says WHAT a deleted record is and what describes it; the web turns that into
 * sentences in the reader's language (Slice 79). Before, the API sent German
 * nouns and finished phrases ("ab 01.03.2026", "Police 4711"), which no
 * catalogue could translate.
 */

/**
 * The kinds of record the app deletes into the trash, in the order of its page.
 * The web names them from these keys everywhere — in the trash, in the master
 * data lists, in error sentences.
 */
export const RECORD_KINDS = [
  'account',
  'company',
  'contract',
  'premium',
  'contractTerms',
  'facility',
  'agency',
  'agencyAccount',
  'submission',
  'invoice',
  'serviceBilling',
  'allocation',
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** What a retention sweep reports on: the record kinds plus deleted users. */
export type RetentionKind = RecordKind | 'user';

/**
 * Rows that are not records of their own but go with the record they belong
 * to when it is removed for good (an invoice's place in a submission, a bonus
 * tier, a reminder, …).
 */
export const ATTACHED_ROW_KINDS = [
  'submissionInvoice',
  'invoiceExclusion',
  'bonusTier',
  'contractYear',
  'roleGrant',
  'reminder',
] as const;

export type AttachedRowKind = (typeof ATTACHED_ROW_KINDS)[number];

/**
 * One piece of what describes a deleted record. Dates are ISO (`YYYY-MM-DD`),
 * amounts are euros as numbers — formatting belongs to the reader.
 */
export type TrashPart =
  /** A value that reads the same in every language: a name, a number, an IBAN. */
  | { type: 'text'; value: string }
  | { type: 'date'; value: string }
  | { type: 'money'; value: number }
  /** "geboren 01.02.1980" */
  | { type: 'born'; date: string }
  /** "Police 4711" */
  | { type: 'policy'; number: string }
  /** "ab 01.03.2026" — a premium's start */
  | { type: 'validFrom'; date: string }
  /** "ab Jahr 3" — a set of terms' start */
  | { type: 'validFromYear'; year: number }
  /** "vom 04.03.2026" — a submission's or a billing's date */
  | { type: 'dated'; date: string }
  /** "120,00 € im Monat", or the bonus-relevant share when only that is known */
  | { type: 'premium'; amount: number; bonusRelevant: boolean }
  /** "12 km" */
  | { type: 'distance'; km: number }
  /** "Rechnung R-17" */
  | { type: 'invoice'; number: string }
  /** "Abrechnung A-3" */
  | { type: 'billing'; number: string };
