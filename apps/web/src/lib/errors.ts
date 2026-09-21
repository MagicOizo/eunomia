import { HttpError } from './http';

/**
 * Turns any thrown error into a readable German message. Validation errors list
 * their issue messages; `conflictMessage` replaces the server's generic text for
 * a 409 where the caller knows what the conflict means (e.g. a duplicate).
 */
export function describeError(error: unknown, conflictMessage?: string): string {
  if (error instanceof HttpError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const messages = (error.details as Array<{ message?: string }>)
        .map((issue) => issue.message)
        .filter(Boolean);
      if (messages.length > 0) return messages.join('; ');
    }
    if (error.code === 'CONFLICT' && conflictMessage) return conflictMessage;
    if (error.status === 403) return 'Dazu fehlt dir die Berechtigung.';
    return error.message;
  }
  return 'Unerwarteter Fehler.';
}
