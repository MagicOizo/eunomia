import type { Response } from 'express';

/**
 * Uniform success envelope. Every successful response carries its payload under
 * a `data` key, mirroring the `{ error: { ... } }` shape of failures, so
 * clients can branch on the presence of `data` vs `error`.
 */
export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}
