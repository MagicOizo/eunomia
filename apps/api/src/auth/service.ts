import { timingSafeEqual } from 'node:crypto';

import type { Pool } from 'mariadb';

import type { AuthConfig } from '../config/env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  invalidCredentials,
  invalidRefreshToken,
  invalidSetupToken,
  setupAlreadyDone,
  setupDisabled,
} from './errors.js';
import {
  type AuthUser,
  assignGlobalRole,
  countUsers,
  createUser,
  findUserByEmailWithHash,
  findUserByValidRefreshToken,
  insertRefreshToken,
  revokeRefreshToken,
} from './repository.js';
import type { LoginInput, SetupInput } from './schemas.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

const ADMIN_ROLE_NAME = 'Admin';

// A well-formed but non-matching hash, used to spend the same work verifying a
// password even when the email is unknown, so response timing does not reveal
// which emails exist.
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export interface IssuedSession {
  accessToken: string;
  /** Opaque refresh token to set as the httpOnly cookie. */
  refreshToken: string;
  /** Absolute expiry for the refresh cookie's Max-Age. */
  refreshExpiresAt: Date;
  user: AuthUser;
}

/** Constant-time string comparison that tolerates differing lengths. */
function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Signs an access token and issues + stores a fresh refresh token for a user. */
async function issueSession(
  pool: Pool,
  config: AuthConfig,
  user: AuthUser,
): Promise<IssuedSession> {
  const accessToken = await signAccessToken(
    user.uuidText,
    config.jwtSecret,
    config.accessTokenTtlSeconds,
  );
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
  await insertRefreshToken(pool, user.userId, tokenHash, refreshExpiresAt);
  return { accessToken, refreshToken, refreshExpiresAt, user };
}

/**
 * Creates the first admin. Only possible while (a) a SETUP_TOKEN is configured
 * and matches, and (b) no user exists yet — enforced in that order so a wrong
 * token never reveals whether setup is still open.
 */
export async function setupFirstAdmin(
  pool: Pool,
  config: AuthConfig,
  input: SetupInput,
  providedToken: string | undefined,
): Promise<AuthUser> {
  if (config.setupToken === undefined) throw setupDisabled();
  if (providedToken === undefined || !safeEquals(providedToken, config.setupToken)) {
    throw invalidSetupToken();
  }
  if ((await countUsers(pool)) > 0) throw setupAlreadyDone();

  const passwordHash = await hashPassword(input.password);
  const user = await createUser(pool, {
    email: input.email,
    firstname: input.firstname,
    surname: input.surname ?? null,
    passwordHash,
  });
  await assignGlobalRole(pool, user.userId, ADMIN_ROLE_NAME);
  return user;
}

/** Verifies credentials and issues a session, or throws invalidCredentials. */
export async function login(
  pool: Pool,
  config: AuthConfig,
  input: LoginInput,
): Promise<IssuedSession> {
  const user = await findUserByEmailWithHash(pool, input.email);
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk || user.userStatus !== 1) throw invalidCredentials();

  return issueSession(pool, config, user);
}

/**
 * Rotates a refresh token: the presented token is revoked and a brand-new
 * session is issued. A missing/expired/revoked token throws, and reusing an
 * already-rotated token fails because it was revoked on first use.
 */
export async function refresh(
  pool: Pool,
  config: AuthConfig,
  presentedToken: string | undefined,
): Promise<IssuedSession> {
  if (!presentedToken) throw invalidRefreshToken();
  const tokenHash = hashRefreshToken(presentedToken);
  const user = await findUserByValidRefreshToken(pool, tokenHash);
  if (!user || user.userStatus !== 1) throw invalidRefreshToken();

  await revokeRefreshToken(pool, tokenHash);
  return issueSession(pool, config, user);
}

/** Revokes the presented refresh token. Idempotent — an unknown token is a no-op. */
export async function logout(pool: Pool, presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;
  await revokeRefreshToken(pool, hashRefreshToken(presentedToken));
}
