import { ERROR_CODES, type PermissionKey } from '@eunomia/shared';

import type { AuthFailure } from '../lib/audit.js';
import { ApiError } from '../lib/api-error.js';

/**
 * Auth failures are ApiErrors with auth-specific codes; the shared error
 * middleware renders them like any other ApiError.
 */
export class AuthError extends ApiError {}

/**
 * The two refusals the audit trail reports (SEC-09) carry what the error
 * handler cannot see. It is the one place every refused request passes
 * through — including the 37 routes that check inside their handler (SEC-17) —
 * but it only ever receives a finished 401 or 403, with no idea which token
 * was wrong or which permission was missing. So the thrower attaches it here.
 *
 * Deliberately a field on the error and NOT in `details`: `details` is part of
 * the response body, and neither the reason a token failed nor the name of a
 * permission is something a caller should be told. The answer to the client
 * stays unchanged to the character.
 */
export class UnauthenticatedError extends AuthError {
  constructor(readonly reason: AuthFailure) {
    super(401, ERROR_CODES.UNAUTHENTICATED, 'Authentication required');
  }
}

export class ForbiddenError extends AuthError {
  constructor(
    readonly permission?: PermissionKey,
    readonly accountUID?: string,
  ) {
    super(403, ERROR_CODES.FORBIDDEN, 'You do not have permission to perform this action');
  }
}

export const invalidCredentials = (): AuthError =>
  new AuthError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');

/**
 * Deliberately 403, not 401: the caller IS authenticated, only the proof of the
 * old password is wrong. A 401 would make apps/web's apiFetch spend a refresh
 * and a retry on a request that cannot succeed either way.
 */
export const invalidCurrentPassword = (): AuthError =>
  new AuthError(403, ERROR_CODES.INVALID_CURRENT_PASSWORD, 'Current password is incorrect');

export const invalidRefreshToken = (): AuthError =>
  new AuthError(
    401,
    ERROR_CODES.INVALID_REFRESH_TOKEN,
    'Refresh token is missing, invalid or expired',
  );

export const setupDisabled = (): AuthError =>
  new AuthError(403, ERROR_CODES.SETUP_DISABLED, 'Setup is disabled (no SETUP_TOKEN configured)');

export const invalidSetupToken = (): AuthError =>
  new AuthError(403, ERROR_CODES.INVALID_SETUP_TOKEN, 'Invalid setup token');

export const setupAlreadyDone = (): AuthError =>
  new AuthError(409, ERROR_CODES.SETUP_ALREADY_DONE, 'Setup has already been completed');

/** The reason never reaches the client; it only reaches the log (see above). */
export const unauthenticated = (reason: AuthFailure): AuthError => new UnauthenticatedError(reason);

/**
 * `permission` and `accountUID` are optional in the type only so that a future
 * thrower compiles; every one of today's eight passes both where it has them,
 * which is what makes an AUTH_FORBIDDEN line say what was actually refused.
 */
export const forbidden = (permission?: PermissionKey, accountUID?: string): AuthError =>
  new ForbiddenError(permission, accountUID);
