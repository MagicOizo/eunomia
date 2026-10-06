import type { ErrorCode } from '@eunomia/shared';

import { fieldFormat, fieldLabel, settingLabel } from './field-labels';
import { activeLanguage } from './format';
import { isTrashRef, namedEntry, notRestorableReason } from '../trash/trash-text';
import { i18n } from './i18n';
import { capitalized, countedKind } from './kind-names';

/**
 * Sentences for what the API reports, in the UI language. The API answers in
 * English (its messages are for API clients and logs); the UI never shows
 * those. Two sources are translated here:
 *
 * - `VALIDATION_ERROR` carries zod issues, which are turned into a sentence
 *   from the issue's `code` and the field's label.
 * - Every other failure carries a specific error code (@eunomia/shared) plus the
 *   data its sentence needs in `details`. The table below is keyed by that list,
 *   so a new code without a sentence does not compile — and every sentence is
 *   a catalogue key, so one missing from a language does not compile either.
 */

const { t } = i18n.global;

/** The parts of a zod issue this translation uses (zod 3 shapes). */
interface ZodIssueLike {
  code?: string;
  path?: Array<string | number>;
  validation?: string;
  type?: string;
  minimum?: number;
  maximum?: number;
  received?: string;
}

type Details = Record<string, unknown>;

/**
 * Why a button is disabled — the same sentence the API answers a `FORBIDDEN`
 * with, said before the click instead of after it (CR-26). It stands here so
 * the two never drift apart.
 */
export function noPermission(): string {
  return t('errors.noPermission');
}

/** The field a zod issue belongs to: the last named segment of its path. */
function keyOf(issue: ZodIssueLike): string {
  const named = (issue.path ?? []).filter((part): part is string => typeof part === 'string');
  return named[named.length - 1] ?? '';
}

function tooSmall(issue: ZodIssueLike, label: string): string {
  const min = issue.minimum ?? 0;
  if (issue.type === 'string') {
    return min <= 1
      ? t('errors.issue.required', { label })
      : t('errors.issue.minLength', { label, min });
  }
  if (issue.type === 'array') return t('errors.issue.minEntries', { label });
  return t('errors.issue.minValue', { label, min });
}

function tooBig(issue: ZodIssueLike, label: string): string {
  const max = issue.maximum ?? 0;
  if (issue.type === 'string') return t('errors.issue.maxLength', { label, max });
  if (issue.type === 'array') return t('errors.issue.maxEntries', { label, max });
  return t('errors.issue.maxValue', { label, max });
}

/** The sentence that spells out a field's own format, where one is written down. */
function formatSentence(key: string, label: string): string | null {
  const format = fieldFormat(key);
  return format === null ? null : t('errors.issue.format', { label, format });
}

function invalidString(issue: ZodIssueLike, key: string, label: string): string {
  switch (issue.validation) {
    case 'email':
      return t('errors.issue.email', { label });
    case 'url':
      return t('errors.issue.url', { label });
    case 'date':
    case 'datetime':
      return t('errors.issue.date', { label });
    default:
      return formatSentence(key, label) ?? t('errors.issue.unexpectedString', { label });
  }
}

/** One validation issue as a sentence. */
export function describeIssue(issue: ZodIssueLike): string {
  const key = keyOf(issue);
  const label = fieldLabel(key);

  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null'
        ? t('errors.issue.required', { label })
        : t('errors.issue.unexpectedType', { label });
    case 'too_small':
      return tooSmall(issue, label);
    case 'too_big':
      return tooBig(issue, label);
    case 'invalid_string':
      return invalidString(issue, key, label);
    case 'invalid_date':
      return t('errors.issue.date', { label });
    // A refinement (`.refine`) carries no `validation` to translate. Where the
    // field writes down a format, that is the sentence — it is how the document
    // link's refused scheme gets explained instead of being called merely
    // inadmissible (SEC-01). A refinement that is not about a format at all
    // (two entries for the same invoice) keeps the general sentence.
    case 'custom':
      return formatSentence(key, label) ?? t('errors.issue.notAllowed', { label });
    default:
      return t('errors.issue.notAllowed', { label });
  }
}

/** Invoice numbers (or other names) the server named, as a readable list. */
function list(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(', ') : '';
}

/**
 * The sentence for a resource the API reports as missing, keyed by the API's
 * English name for it. Whole sentences rather than a noun dropped into one:
 * the article and the verb agree with the noun, differently in each language.
 */
const NOT_FOUND: Record<string, () => string> = {
  Account: () => t('errors.notFound.account'),
  Allocation: () => t('errors.notFound.allocation'),
  'Bank account': () => t('errors.notFound.bankAccount'),
  'Collection agency': () => t('errors.notFound.agency'),
  Contract: () => t('errors.notFound.contract'),
  'Contract terms': () => t('errors.notFound.terms'),
  'Deleted record': () => t('errors.notFound.deletedRecord'),
  Exclusion: () => t('errors.notFound.exclusion'),
  Facility: () => t('errors.notFound.facility'),
  'Insurance company': () => t('errors.notFound.company'),
  Invoice: () => t('errors.notFound.invoice'),
  'Invoice in submission': () => t('errors.notFound.invoiceInSubmission'),
  Premium: () => t('errors.notFound.premium'),
  Resource: () => t('errors.notFound.entry'),
  'Service billing': () => t('errors.notFound.billing'),
  Submission: () => t('errors.notFound.submission'),
  User: () => t('errors.notFound.user'),
};

/**
 * Premium and terms share the history rules but not their grammar
 * ("Konditionen können …" vs "Ein Beitragsstand kann …"), so each has its own
 * sentence.
 */
const isTerms = (details: Details): boolean => details.kind === 'terms';

/**
 * The record a failure hung on, when the API named one (`details.entry`). The
 * trash needs it: a restore covers a record AND what was deleted with it, so
 * the sentence has to say which of them refused — and that nothing moved.
 */
function entryPrefix(details: Details): string {
  const entry = details.entry;
  return isTrashRef(entry) ? `${capitalized(namedEntry(entry.kind, entry.label))}: ` : '';
}

/** Lower-cases the sentence's first letter after a prefix ("Rechnung „R-1“: die …"). */
const sentence = (prefix: string, rest: string): string =>
  prefix === ''
    ? rest
    : prefix + rest.charAt(0).toLocaleLowerCase(activeLanguage()) + rest.slice(1);

/**
 * A sentence about one record of a restore: prefixed with the record when the
 * API named one, and closed by the reminder that a restore is all or nothing.
 */
function restoreSentence(details: Details, text: string): string {
  const prefix = entryPrefix(details);
  return prefix === '' ? text : `${sentence(prefix, text)} ${t('errors.nothingRestored')}`;
}

/** Every code but the one that carries zod issues, which is read field by field. */
type SentenceCode = Exclude<ErrorCode, 'VALIDATION_ERROR'>;

const CODE_MESSAGES: Record<SentenceCode, (details: Details) => string> = {
  NOT_FOUND: (d) => (NOT_FOUND[String(d.resource)] ?? NOT_FOUND.Resource)(),
  DUPLICATE_VALUE: () => t('errors.code.DUPLICATE_VALUE'),
  STILL_REFERENCED: (d) => {
    const blockers = Array.isArray(d.blockers)
      ? (d.blockers as Array<{ kind?: unknown; count?: unknown }>)
          .filter((one) => typeof one.kind === 'string' && typeof one.count === 'number')
          .map((one) => countedKind(String(one.kind), Number(one.count)))
      : [];
    return blockers.length === 0
      ? t('errors.code.STILL_REFERENCED')
      : t('errors.code.STILL_REFERENCED_BY', { blockers: blockers.join(', ') });
  },
  MISSING_REFERENCE: () => t('errors.code.MISSING_REFERENCE'),
  BAD_REQUEST: () => t('errors.code.BAD_REQUEST'),
  CONFLICT: () => t('errors.code.CONFLICT'),
  INTERNAL: () => t('errors.code.INTERNAL'),
  RATE_LIMITED: () => t('errors.code.RATE_LIMITED'),

  // Anmeldung und Ersteinrichtung
  INVALID_CREDENTIALS: () => t('errors.code.INVALID_CREDENTIALS'),
  INVALID_CURRENT_PASSWORD: () => t('errors.code.INVALID_CURRENT_PASSWORD'),
  INVALID_REFRESH_TOKEN: () => t('errors.code.INVALID_REFRESH_TOKEN'),
  UNAUTHENTICATED: () => t('errors.code.UNAUTHENTICATED'),
  FORBIDDEN: () => noPermission(),
  SETUP_DISABLED: () => t('errors.code.SETUP_DISABLED'),
  INVALID_SETUP_TOKEN: () => t('errors.code.INVALID_SETUP_TOKEN'),
  SETUP_ALREADY_DONE: () => t('errors.code.SETUP_ALREADY_DONE'),

  // Rechnungen, Einreichungen, Abrechnungen
  INVOICES_UNKNOWN: (d) => t('errors.code.INVOICES_UNKNOWN', { invoices: list(d.invoices) }),
  INVOICES_WRONG_ACCOUNT: (d) =>
    t('errors.code.INVOICES_WRONG_ACCOUNT', { invoices: list(d.invoices) }),
  INVOICES_ALREADY_SUBMITTED: (d) =>
    t('errors.code.INVOICES_ALREADY_SUBMITTED', { invoices: list(d.invoices) }),
  INVOICES_EXCLUDED: (d) => t('errors.code.INVOICES_EXCLUDED', { invoices: list(d.invoices) }),
  INVOICES_ALREADY_BILLED: (d) =>
    t('errors.code.INVOICES_ALREADY_BILLED', { invoices: list(d.invoices) }),
  INVOICES_NOT_COVERED: (d) =>
    t('errors.code.INVOICES_NOT_COVERED', { invoices: list(d.invoices) }),
  INVOICES_NOT_SUBMITTED_HERE: (d) =>
    t('errors.code.INVOICES_NOT_SUBMITTED_HERE', { invoices: list(d.invoices) }),
  REIMBURSEMENT_EXCEEDS_INVOICE: (d) =>
    restoreSentence(
      d,
      t('errors.code.REIMBURSEMENT_EXCEEDS_INVOICE', { invoices: list(d.invoices) }),
    ),
  INVOICE_AMOUNT_BELOW_REIMBURSED: () => t('errors.code.INVOICE_AMOUNT_BELOW_REIMBURSED'),
  INVOICE_NOT_SUBMITTED: () => t('errors.code.INVOICE_NOT_SUBMITTED'),
  INVOICE_ALREADY_SUBMITTED: () => t('errors.code.INVOICE_ALREADY_SUBMITTED'),
  INVOICE_ALREADY_EXCLUDED: () => t('errors.code.INVOICE_ALREADY_EXCLUDED'),
  CONTRACT_ACCOUNT_MISMATCH: () => t('errors.code.CONTRACT_ACCOUNT_MISMATCH'),
  TREATMENT_DAYS_DIFFERENT_YEARS: () => t('errors.code.TREATMENT_DAYS_DIFFERENT_YEARS'),
  INVOICE_NOT_COVERED_REASON_REQUIRED: () => t('errors.code.INVOICE_NOT_COVERED_REASON_REQUIRED'),
  INVOICE_NOT_COVERED_SUBMITTED: () => t('errors.code.INVOICE_NOT_COVERED_SUBMITTED'),
  INVOICE_ACCOUNT_NOT_OF_AGENCY: () => t('errors.code.INVOICE_ACCOUNT_NOT_OF_AGENCY'),
  INVOICE_HAS_REIMBURSEMENT: () => t('errors.code.INVOICE_HAS_REIMBURSEMENT'),
  BILLING_NUMBER_TAKEN: (d) =>
    restoreSentence(
      d,
      t('errors.code.BILLING_NUMBER_TAKEN', { billingNumber: String(d.billingNumber) }),
    ),

  // Policen
  HISTORY_BEFORE_CONTRACT: (d) =>
    isTerms(d)
      ? t('errors.code.HISTORY_BEFORE_CONTRACT.terms')
      : t('errors.code.HISTORY_BEFORE_CONTRACT.premium'),
  HISTORY_AFTER_CONTRACT: (d) =>
    isTerms(d)
      ? t('errors.code.HISTORY_AFTER_CONTRACT.terms')
      : t('errors.code.HISTORY_AFTER_CONTRACT.premium'),
  HISTORY_START_EXISTS: (d) =>
    restoreSentence(
      d,
      isTerms(d)
        ? t('errors.code.HISTORY_START_EXISTS.terms')
        : t('errors.code.HISTORY_START_EXISTS.premium'),
    ),
  YEAR_OUTSIDE_CONTRACT: () => t('errors.code.YEAR_OUTSIDE_CONTRACT'),

  // Papierkorb
  PARENT_IN_TRASH: (d) => {
    const parent = d.parent;
    const named = isTrashRef(parent)
      ? capitalized(namedEntry(parent.kind, parent.label))
      : t('errors.code.PARENT_UNNAMED');
    // Not lower-cased after the prefix: it starts with a noun.
    const text = t('errors.code.PARENT_IN_TRASH', { parent: named });
    return `${entryPrefix(d)}${text} ${t('errors.nothingRestored')}`;
  },
  NOT_RESTORABLE: (d) =>
    isTrashRef(d.entry)
      ? `${entryPrefix(d)}${notRestorableReason(d.entry.kind)}`
      : t('errors.code.NOT_RESTORABLE'),
  RESTORE_CONFLICT: (d) =>
    `${sentence(entryPrefix(d), t('errors.code.RESTORE_CONFLICT'))} ${t('errors.nothingRestored')}`,

  // Nutzerverwaltung
  SELF_ACCOUNT_ACTION: () => t('errors.code.SELF_ACCOUNT_ACTION'),
  LAST_ADMIN: () => t('errors.code.LAST_ADMIN'),
  USER_NOT_DELETED: () => t('errors.code.USER_NOT_DELETED'),

  // System-Einstellungen und E-Mail-Versand
  SETTING_UNKNOWN: () => t('errors.code.SETTING_UNKNOWN'),
  SETTING_READONLY: () => t('errors.code.SETTING_READONLY'),
  SETTING_INVALID_VALUE: (d) =>
    typeof d.key === 'string'
      ? t('errors.code.SETTING_INVALID_VALUE', { label: settingLabel(d.key) })
      : t('errors.code.SETTING_INVALID_VALUE_UNNAMED'),
  SETTINGS_ENCRYPTION_UNAVAILABLE: () => t('errors.code.SETTINGS_ENCRYPTION_UNAVAILABLE'),
  MAIL_NOT_CONFIGURED: () => t('errors.code.MAIL_NOT_CONFIGURED'),
  MAIL_SEND_FAILED: (d) =>
    typeof d.reason === 'string'
      ? t('errors.code.MAIL_SEND_FAILED', { reason: d.reason })
      : t('errors.code.MAIL_SEND_FAILED_UNNAMED'),
  REMINDERS_DISABLED: () => t('errors.code.REMINDERS_DISABLED'),
  RETENTION_DISABLED: () => t('errors.code.RETENTION_DISABLED'),
};

/**
 * The sentence for an error code, or null if the code is unknown here — which
 * an older client can still see from a newer server.
 */
export function describeCode(code: string, details: unknown): string | null {
  const build = (CODE_MESSAGES as Record<string, ((details: Details) => string) | undefined>)[code];
  if (!build) return null;
  return build(typeof details === 'object' && details !== null ? (details as Details) : {});
}
