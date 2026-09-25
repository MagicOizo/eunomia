/**
 * The error codes the API answers with. They are the contract the UI
 * translates: the messages here stay English (they are for API clients and
 * logs), while apps/web turns the code — together with the structured
 * `details` — into a German sentence. A new failure case therefore gets its
 * own code, not just a new sentence; without one the UI can only fall back to
 * a generic message.
 */
export const ERROR_CODES = {
  // Generic and infrastructure
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
  /** Unique constraint hit (MariaDB 1062). */
  DUPLICATE_VALUE: 'DUPLICATE_VALUE',
  /** Row is still referenced by others (1451), e.g. deleting a used facility. */
  STILL_REFERENCED: 'STILL_REFERENCED',
  /** Points at a row that does not exist (1452). */
  MISSING_REFERENCE: 'MISSING_REFERENCE',

  // Authentication and setup (see auth/errors.ts)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  SETUP_DISABLED: 'SETUP_DISABLED',
  INVALID_SETUP_TOKEN: 'INVALID_SETUP_TOKEN',
  SETUP_ALREADY_DONE: 'SETUP_ALREADY_DONE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  // Invoices, submissions and their billings. Each of these carries the
  // affected invoices in `details.invoices` (numbers where known).
  INVOICES_UNKNOWN: 'INVOICES_UNKNOWN',
  INVOICES_WRONG_ACCOUNT: 'INVOICES_WRONG_ACCOUNT',
  INVOICES_ALREADY_SUBMITTED: 'INVOICES_ALREADY_SUBMITTED',
  INVOICES_EXCLUDED: 'INVOICES_EXCLUDED',
  INVOICES_ALREADY_BILLED: 'INVOICES_ALREADY_BILLED',
  INVOICES_NOT_SUBMITTED_HERE: 'INVOICES_NOT_SUBMITTED_HERE',
  REIMBURSEMENT_EXCEEDS_INVOICE: 'REIMBURSEMENT_EXCEEDS_INVOICE',
  INVOICE_AMOUNT_BELOW_REIMBURSED: 'INVOICE_AMOUNT_BELOW_REIMBURSED',
  INVOICE_NOT_SUBMITTED: 'INVOICE_NOT_SUBMITTED',
  INVOICE_ALREADY_SUBMITTED: 'INVOICE_ALREADY_SUBMITTED',
  INVOICE_ALREADY_EXCLUDED: 'INVOICE_ALREADY_EXCLUDED',
  CONTRACT_ACCOUNT_MISMATCH: 'CONTRACT_ACCOUNT_MISMATCH',
  INVOICE_HAS_REIMBURSEMENT: 'INVOICE_HAS_REIMBURSEMENT',
  /** The policy already has an active billing under that number. */
  BILLING_NUMBER_TAKEN: 'BILLING_NUMBER_TAKEN',

  // Policies: premium/terms history (`details.kind`) and recorded years
  HISTORY_BEFORE_CONTRACT: 'HISTORY_BEFORE_CONTRACT',
  HISTORY_AFTER_CONTRACT: 'HISTORY_AFTER_CONTRACT',
  HISTORY_START_EXISTS: 'HISTORY_START_EXISTS',
  YEAR_OUTSIDE_CONTRACT: 'YEAR_OUTSIDE_CONTRACT',
  INVALID_YEAR: 'INVALID_YEAR',

  // User administration
  SELF_ACCOUNT_ACTION: 'SELF_ACCOUNT_ACTION',
  LAST_ADMIN: 'LAST_ADMIN',

  // System settings and mail (see settings/registry.ts, mail/mailer.ts)
  /** Key is not in the settings registry — a typo, or an outdated client. */
  SETTING_UNKNOWN: 'SETTING_UNKNOWN',
  /** Key exists but is written by the application (e.g. the last send status). */
  SETTING_READONLY: 'SETTING_READONLY',
  /** Value has the wrong type or is out of range; `details.expected` says what fits. */
  SETTING_INVALID_VALUE: 'SETTING_INVALID_VALUE',
  /** A secret cannot be stored or read because CONFIG_ENCRYPTION_KEY is missing. */
  SETTINGS_ENCRYPTION_UNAVAILABLE: 'SETTINGS_ENCRYPTION_UNAVAILABLE',
  /** Mail is switched off or incompletely configured; nothing was attempted. */
  MAIL_NOT_CONFIGURED: 'MAIL_NOT_CONFIGURED',
  /** The mail server refused or could not be reached; `details.reason` has its words. */
  MAIL_SEND_FAILED: 'MAIL_SEND_FAILED',
  /** Payment reminders are switched off; the run button does not bypass that. */
  REMINDERS_DISABLED: 'REMINDERS_DISABLED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Extra data the UI interpolates into its German sentence. */
export type ErrorDetails = Record<string, unknown>;
