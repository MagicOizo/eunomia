import type { Request } from 'express';
import type { z } from 'zod';

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

/**
 * Validates the query string against a zod schema. Request bodies are parsed
 * with `schema.parse()` and let the ZodError reach the error handler, but that
 * path answers "Invalid request body" — wrong for a query string. Here the
 * first issue becomes a 400 that names the offending parameter, which is what
 * a filter UI can show. Unknown parameters are dropped, as zod objects do.
 */
export function parseQuery<Schema extends z.ZodType>(
  req: Request,
  schema: Schema,
): z.infer<Schema> {
  const parsed = schema.safeParse(req.query);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  if (issue === undefined) throw badRequest('Invalid query parameters');
  throw badRequest(`Invalid query parameter '${issue.path.join('.')}': ${issue.message}`);
}
