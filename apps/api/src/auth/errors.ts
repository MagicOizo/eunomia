import { ApiError } from '../lib/api-error.js';

/**
 * Auth failures are ApiErrors with auth-specific codes; the shared error
 * middleware renders them like any other ApiError.
 */
export class AuthError extends ApiError {}

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
