import type { Response } from 'express';

/**
 * Uniform success envelope. Every successful response carries its payload under
 * a `data` key, mirroring the `{ error: { ... } }` shape of failures, so
 * clients can branch on the presence of `data` vs `error`.
 *
 * Three routes answer without it, deliberately, and they are the only ones:
 * `GET /version` is the health check and is read before anyone has logged in,
 * and `/auth/*` together with `/me` hand out a session, not a record. Anywhere
 * else a bare `res.json` is a route that forgot this helper.
 */
export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}
