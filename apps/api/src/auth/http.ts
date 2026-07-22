import type { CookieOptions, Response } from 'express';

/**
 * The refresh token lives in an httpOnly cookie scoped to the auth routes, so
 * it is never exposed to JavaScript and is only sent back on login/refresh/
 * logout — not on every API call (see Notes/eunomia-plan.md, 1.3.5). The access
 * token, by contrast, travels in the JSON body and the Authorization header.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function refreshCookieOptions(isProduction: boolean, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(expires ? { expires } : {}),
  };
}

/** Sets the refresh-token cookie on a response. */
export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  isProduction: boolean,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(isProduction, expiresAt));
}

/** Clears the refresh-token cookie (same attributes, so browsers actually drop it). */
export function clearRefreshCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(isProduction));
}

/** Parses the request `Cookie` header into a name→value map (no dependency). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

/** Reads the refresh token from the request cookies, if present. */
export function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[REFRESH_COOKIE_NAME];
}
