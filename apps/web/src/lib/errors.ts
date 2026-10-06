import { describeCode, describeIssue } from './error-messages';
import { HttpError } from './http';
import { i18n } from './i18n';

const { t } = i18n.global;

/**
 * Turns any thrown error into a readable message in the UI language — what the
 * user sees is never the API's own text (see error-messages.ts). Validation errors are
 * translated issue by issue; every other failure comes from its error code.
 * `conflictMessage` overrides the code's sentence for a 409 where the calling
 * dialog can say it more precisely (the same rule reads differently when
 * lowering an invoice amount than when booking a reimbursement).
 */
export function describeError(error: unknown, conflictMessage?: string): string {
  if (error instanceof HttpError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const messages = error.details.map((issue: unknown) =>
        describeIssue(typeof issue === 'object' && issue !== null ? issue : {}),
      );
      if (messages.length > 0) return [...new Set(messages)].join(' ');
    }
    if (error.status === 409 && conflictMessage) return conflictMessage;

    const message = describeCode(error.code, error.details);
    if (message) return message;

    // An unmapped code would otherwise show the server's own sentence. The
    // console may stay English; the dialog speaks the UI language.
    console.error('Untranslated API error:', error.code, error.message, error.details);
    return t('errors.actionFailed');
  }
  return t('errors.unexpected');
}
