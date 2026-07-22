import type { Request } from 'express';

import { badRequest } from '../lib/api-error.js';

/**
 * Reads a single path parameter as a string. Express's type for `req.params`
 * is broad (`string | string[] | undefined`); a `:name` route segment is
 * always a single string at runtime, so anything else is a programmer error.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw badRequest(`Missing path parameter: ${name}`);
  return value;
}

/** Same as pathParam but yields undefined instead of throwing (for optional scoping). */
export function optionalPathParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === 'string' ? value : undefined;
}
