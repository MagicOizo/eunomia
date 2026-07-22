import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AuthError } from '../auth/errors.js';

/**
 * Terminal error middleware turning known error types into a uniform JSON
 * envelope `{ error: { code, message } }`. Unknown errors are logged and
 * reported as a generic 500 so internals never leak to clients.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-arg shape
  _next: NextFunction,
): void {
  if (err instanceof AuthError) {
    res.status(err.httpStatus).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: err.issues },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
