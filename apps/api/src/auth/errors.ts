/**
 * Auth failures carry the HTTP status and a stable machine-readable `code` the
 * route layer turns into a JSON error response, so handlers can throw instead
 * of threading status codes through return values.
 */
export class AuthError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const invalidCredentials = (): AuthError =>
  new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

export const invalidRefreshToken = (): AuthError =>
  new AuthError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is missing, invalid or expired');

export const setupDisabled = (): AuthError =>
  new AuthError(403, 'SETUP_DISABLED', 'Setup is disabled (no SETUP_TOKEN configured)');

export const invalidSetupToken = (): AuthError =>
  new AuthError(403, 'INVALID_SETUP_TOKEN', 'Invalid setup token');

export const setupAlreadyDone = (): AuthError =>
  new AuthError(409, 'SETUP_ALREADY_DONE', 'Setup has already been completed');

export const unauthenticated = (): AuthError =>
  new AuthError(401, 'UNAUTHENTICATED', 'Authentication required');

export const forbidden = (): AuthError =>
  new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
