import { ERROR_CODES } from '@eunomia/shared';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { ForbiddenError, UnauthenticatedError } from '../auth/errors.js';
import { tryGetAuthUser } from '../auth/middleware.js';
import { ApiError } from './api-error.js';
import { auditForbidden, auditUnauthenticated } from './audit.js';

/** MariaDB driver error shape we care about (a subset of SqlError). */
interface SqlErrorLike {
  errno: number;
}

/**
 * The one place that asks the question: whatever the driver threw, does it
 * carry an error number? Exported because the trash asks it too, about the
 * unique violation a restore can run into.
 */
export function isSqlError(err: unknown): err is SqlErrorLike {
  // The assertion is the question itself: whether the field is there is what
  // the next line measures.
  return typeof err === 'object' && err !== null && typeof (err as SqlErrorLike).errno === 'number';
}

/** Maps known MariaDB error numbers to a client-facing ApiError, or null. */
function mapSqlError(err: SqlErrorLike): ApiError | null {
  switch (err.errno) {
    case 1062: // ER_DUP_ENTRY
      return new ApiError(
        409,
        ERROR_CODES.DUPLICATE_VALUE,
        'A record with the same unique value already exists',
      );
    case 1451: // ER_ROW_IS_REFERENCED_2 — still referenced by another row
      return new ApiError(
        409,
        ERROR_CODES.STILL_REFERENCED,
        'Record is still referenced by other records',
      );
    case 1452: // ER_NO_REFERENCED_ROW_2 — points at a missing row
      return new ApiError(400, ERROR_CODES.MISSING_REFERENCE, 'A referenced record does not exist');
    default:
      return null;
  }
}

/**
 * Writes the audit line for a refused request (SEC-09). This is the one place
 * worth doing it: every refusal ends here, including the 37 routes that check
 * inside the handler rather than behind a guard (SEC-17), so there is no
 * second code path that could forget.
 *
 * An expired access token is the one refusal that stays silent — see
 * `lib/audit.ts`. Note what is NOT covered here either: a rejected refresh
 * token on /auth/refresh. The alarming case of that, a token shown twice, has
 * had AUTH_REFRESH_REUSE since the session slice; the rest is a 30-day expiry
 * or the race between logging out and refreshing, i.e. normal operation.
 */
function auditRefusal(err: unknown, req: Request, res: Response): void {
  if (err instanceof UnauthenticatedError) {
    if (err.reason === 'token_expired') return;
    auditUnauthenticated({
      reason: err.reason,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    return;
  }
  if (err instanceof ForbiddenError) {
    auditForbidden({
      // A 403 always has a user behind it: the permission check runs after
      // requireAuth. Read without throwing all the same, because an error
      // handler is the last place that should produce an error of its own.
      user: tryGetAuthUser(res)?.uuidText ?? 'unknown',
      permission: err.permission,
      account: err.accountUID,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
  }
}

/**
 * Terminal error middleware turning known error types into a uniform JSON
 * envelope `{ error: { code, message } }`. Unknown errors are logged and
 * reported as a generic 500 so internals never leak to clients.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-arg shape
  _next: NextFunction,
): void {
  auditRefusal(err, req, res);

  const apiError = err instanceof ApiError ? err : isSqlError(err) ? mapSqlError(err) : null;
  if (apiError) {
    res.status(apiError.httpStatus).json({
      error: { code: apiError.code, message: apiError.message, details: apiError.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid request body',
        details: err.issues,
      },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: ERROR_CODES.INTERNAL, message: 'Internal server error' } });
}
