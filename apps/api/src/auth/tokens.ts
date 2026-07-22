import { createHash, randomBytes } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

/**
 * Two token types (see Notes/eunomia-plan.md, 1.3.5):
 *  - the access token is a short-lived HS256 JWT carrying only the user's
 *    public UUID as `sub`; permissions are resolved fresh from the database on
 *    every request rather than baked into the token, so a revoked grant takes
 *    effect immediately;
 *  - the refresh token is an opaque random string. Only its SHA-256 hash is
 *    stored, so the database never holds a usable token.
 */

const JWT_ISSUER = 'eunomia';
const JWT_ALGORITHM = 'HS256';
const REFRESH_TOKEN_BYTES = 32;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs a short-lived access token for the given user UUID. */
export async function signAccessToken(
  userUuid: string,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userUuid)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey(secret));
}

/**
 * Verifies an access token and returns the user UUID it was issued for.
 * Throws (rejects) if the token is missing `sub`, expired, or tampered with.
 */
export async function verifyAccessToken(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: JWT_ISSUER,
    algorithms: [JWT_ALGORITHM],
  });
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new Error('Access token has no subject');
  }
  return payload.sub;
}

/** SHA-256 hex of a refresh token — the only form ever persisted. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a fresh opaque refresh token together with the hash to store for it. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}
