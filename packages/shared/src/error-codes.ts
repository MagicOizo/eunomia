/**
 * The error codes the API answers with. They are the contract the UI
 * translates: the API's own messages stay English (they are for API clients and
 * logs), while apps/web turns the code — together with the structured `details`
 * — into a German sentence (lib/error-messages.ts). A new failure case
 * therefore gets its own code here, and the web's table of sentences is keyed by
 * this list: a code without a sentence does not compile.
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
  /**
   * Row is still referenced by others (1451, or the trash's own check), e.g.
   * deleting a used facility. From the trash it carries `details.blockers`:
   * what still hangs on the record, so the sentence can name it.
   */
  STILL_REFERENCED: 'STILL_REFERENCED',
  /** Points at a row that does not exist (1452). */
  MISSING_REFERENCE: 'MISSING_REFERENCE',

  // Authentication and setup (see auth/errors.ts)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /**
   * The current password presented alongside a new one is wrong. Not
   * INVALID_CREDENTIALS and not a 401: the caller is authenticated, and a 401
   * would send the browser's client into a pointless token rotation and retry.
   */
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
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
  /** Marked as not covered by the insurance: it is never submitted anywhere. */
  INVOICES_NOT_COVERED: 'INVOICES_NOT_COVERED',
  REIMBURSEMENT_EXCEEDS_INVOICE: 'REIMBURSEMENT_EXCEEDS_INVOICE',
  INVOICE_AMOUNT_BELOW_REIMBURSED: 'INVOICE_AMOUNT_BELOW_REIMBURSED',
  INVOICE_NOT_SUBMITTED: 'INVOICE_NOT_SUBMITTED',
  INVOICE_ALREADY_SUBMITTED: 'INVOICE_ALREADY_SUBMITTED',
  INVOICE_ALREADY_EXCLUDED: 'INVOICE_ALREADY_EXCLUDED',
  CONTRACT_ACCOUNT_MISMATCH: 'CONTRACT_ACCOUNT_MISMATCH',
  INVOICE_HAS_REIMBURSEMENT: 'INVOICE_HAS_REIMBURSEMENT',
  /** The treatment days of one invoice span more than one calendar year. */
  TREATMENT_DAYS_DIFFERENT_YEARS: 'TREATMENT_DAYS_DIFFERENT_YEARS',
  /** "Not covered" was set without the reason that is the whole point of it. */
  INVOICE_NOT_COVERED_REASON_REQUIRED: 'INVOICE_NOT_COVERED_REASON_REQUIRED',
  /** "Not covered" was set on an invoice that is already submitted somewhere. */
  INVOICE_NOT_COVERED_SUBMITTED: 'INVOICE_NOT_COVERED_SUBMITTED',
  /** The chosen bank account belongs to another collection agency. */
  INVOICE_ACCOUNT_NOT_OF_AGENCY: 'INVOICE_ACCOUNT_NOT_OF_AGENCY',
  /** The policy already has an active billing under that number. */
  BILLING_NUMBER_TAKEN: 'BILLING_NUMBER_TAKEN',

  // Policies: premium/terms history (`details.kind`) and recorded years
  HISTORY_BEFORE_CONTRACT: 'HISTORY_BEFORE_CONTRACT',
  HISTORY_AFTER_CONTRACT: 'HISTORY_AFTER_CONTRACT',
  HISTORY_START_EXISTS: 'HISTORY_START_EXISTS',
  YEAR_OUTSIDE_CONTRACT: 'YEAR_OUTSIDE_CONTRACT',

  // Papierkorb (see domain/trash.ts). Every failure of a restore additionally
  // carries `details.entry` — the record it hung on, which may be a child of
  // the batch, because a restore is all or nothing.
  /** A NOT NULL ancestor of the record is itself in the trash. */
  PARENT_IN_TRASH: 'PARENT_IN_TRASH',
  /** The record cannot be restored at all (an emptied submission). */
  NOT_RESTORABLE: 'NOT_RESTORABLE',
  /** Fallback for a unique violation no rule check caught first. */
  RESTORE_CONFLICT: 'RESTORE_CONFLICT',

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
