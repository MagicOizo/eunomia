import type { CookieOptions, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';

import { parseCookies } from '../http.js';

/**
 * What a sign-in through the provider has to remember between leaving for the
 * provider and coming back (Slice 88): the `state`, the `nonce` and the PKCE
 * code verifier. It lives in a signed, short-lived cookie rather than a table —
 * ten minutes, nothing to clean up, nothing in it worth more than one redirect
 * (Blueprint §2).
 *
 * Signed with the access-token secret but carrying its own `use` claim and no
 * `sub`: a flow state never verifies as an access token (auth/tokens.ts refuses
 * a `use` claim), and an access token never verifies as a flow state.
 *
 * Signed, not encrypted: the browser that holds the cookie is the one that
 * started the flow, and the verifier only proves to the provider that the code
 * goes back to the same client — it is no secret from that browser.
 */

export const FLOW_COOKIE_NAME = 'oidc_flow';
/** Narrow on purpose: only start and callback ever see the cookie. */
export const FLOW_COOKIE_PATH = '/api/v1/auth/oidc';
export const FLOW_TTL_SECONDS = 10 * 60;

const FLOW_USE = 'oidc-flow';
const JWT_ISSUER = 'eunomia';
const JWT_ALGORITHM = 'HS256';

export interface FlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signFlowState(flow: FlowState, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    use: FLOW_USE,
    state: flow.state,
    nonce: flow.nonce,
    cv: flow.codeVerifier,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuer(JWT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + FLOW_TTL_SECONDS)
    .sign(secretKey(secret));
}

/** The flow state in `token`, or null when it is missing, expired, forged or not a flow state. */
export async function verifyFlowState(
  token: string | undefined,
  secret: string,
): Promise<FlowState | null> {
  if (token === undefined || token === '') return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: JWT_ISSUER,
      algorithms: [JWT_ALGORITHM],
    });
    const { use, state, nonce, cv } = payload;
    if (use !== FLOW_USE) return null;
    if (typeof state !== 'string' || typeof nonce !== 'string' || typeof cv !== 'string') {
      return null;
    }
    return { state, nonce, codeVerifier: cv };
  } catch {
    return null;
  }
}

/**
 * `lax`, unlike the refresh cookie's `strict` (Blueprint, Fund 2): the way back
 * from the provider is a cross-site top-level navigation, and a `strict` cookie
 * would not travel with it — the state would never match, for anyone. `secure`
 * follows the refresh cookie (auth/http.ts).
 */
function flowCookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: FLOW_COOKIE_PATH };
}

export function setFlowCookie(res: Response, token: string, isProduction: boolean): void {
  res.cookie(FLOW_COOKIE_NAME, token, {
    ...flowCookieOptions(isProduction),
    maxAge: FLOW_TTL_SECONDS * 1000,
  });
}

/** One flow, one return: the callback drops the cookie whatever the outcome. */
export function clearFlowCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(FLOW_COOKIE_NAME, flowCookieOptions(isProduction));
}

export function readFlowCookie(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[FLOW_COOKIE_NAME];
}
