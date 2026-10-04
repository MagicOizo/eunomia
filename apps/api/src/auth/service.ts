import { timingSafeEqual } from 'node:crypto';

import type { Pool } from 'mariadb';

import type { AuthConfig } from '../config/env.js';
import {
  type LoginFailure,
  type SourceIp,
  auditLoginFailed,
  auditLoginOk,
  auditLogout,
  auditPasswordChanged,
  auditRefreshReuse,
  auditSetupCompleted,
} from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  invalidCredentials,
  invalidCurrentPassword,
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
  findPasswordHashByUserId,
  findRefreshTokenOwner,
  findUserByEmailWithHash,
  findUserByValidRefreshToken,
  insertRefreshToken,
  deleteActiveRefreshTokens,
  revokeRefreshToken,
  updatePasswordHash,
} from './repository.js';
import type { ChangePasswordInput, LoginInput, SetupInput } from './schemas.js';
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
  ip: SourceIp,
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
  auditSetupCompleted({ user: user.uuidText, email: user.email, ip });
  return user;
}

/**
 * Verifies credentials and issues a session, or throws invalidCredentials.
 *
 * The three ways to fail are told apart for the log and only for the log
 * (SEC-09): the caller hears the same sentence either way, so an attacker
 * still cannot probe which addresses exist, while the operator can tell a
 * password being guessed from a deactivated account being tried again. The
 * dummy hash above keeps the timing equal regardless.
 */
export async function login(
  pool: Pool,
  config: AuthConfig,
  input: LoginInput,
  ip: SourceIp,
): Promise<IssuedSession> {
  const user = await findUserByEmailWithHash(pool, input.email);
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk || user.userStatus !== 1) {
    const reason: LoginFailure = !user
      ? 'unknown_user'
      : !passwordOk
        ? 'bad_password'
        : 'user_inactive';
    auditLoginFailed({ email: input.email, ip, reason });
    throw invalidCredentials();
  }

  auditLoginOk({ user: user.uuidText, ip });
  return issueSession(pool, config, user);
}

/**
 * A refresh token presented a second time is the one reliable sign of a stolen
 * one: the legitimate client never shows a rotated token again (the browser
 * shares one rotation between all waiting requests, see apps/web/src/lib/api.ts).
 * So the whole token chain of that user falls, not just this request, and the
 * event is written where an operator can grep for it.
 *
 * The price, accepted knowingly: if the answer to a successful rotation is lost
 * on the way back, the client still holds the old token, shows it again, and is
 * read as a theft — the user has to log in once more. That is the known cost of
 * reuse detection, and the alternative is not detecting theft at all.
 *
 * The caller hears the same invalidRefreshToken() either way: an attacker must
 * not learn from the answer whether he tripped the alarm.
 */
async function noteRefreshReuse(pool: Pool, tokenHash: string): Promise<void> {
  const owner = await findRefreshTokenOwner(pool, tokenHash);
  if (owner === null || owner.revokedAt === null) return;

  const ended = await deleteActiveRefreshTokens(pool, owner.userId);
  auditRefreshReuse({ user: owner.uuidText, sessionsEnded: ended });
}

/**
 * Rotates a refresh token: the presented token is revoked and a brand-new
 * session is issued. A missing/expired/revoked token throws — and a revoked one
 * additionally costs the user every other session (see noteRefreshReuse).
 */
export async function refresh(
  pool: Pool,
  config: AuthConfig,
  presentedToken: string | undefined,
): Promise<IssuedSession> {
  if (!presentedToken) throw invalidRefreshToken();
  const tokenHash = hashRefreshToken(presentedToken);
  const user = await findUserByValidRefreshToken(pool, tokenHash);
  if (!user || user.userStatus !== 1) {
    if (user === null) await noteRefreshReuse(pool, tokenHash);
    throw invalidRefreshToken();
  }

  await revokeRefreshToken(pool, tokenHash);
  return issueSession(pool, config, user);
}

/**
 * Changes the caller's own password against the old one, then ends every other
 * session of theirs — which is the whole point of changing it (SEC-05). The
 * session that asked keeps its refresh token: being logged out of the browser
 * one just typed the old password into would be a punishment for doing the
 * right thing.
 */
export async function changeOwnPassword(
  pool: Pool,
  user: AuthUser,
  input: ChangePasswordInput,
  currentRefreshToken: string | undefined,
  ip: SourceIp,
): Promise<void> {
  const passwordHash = await findPasswordHashByUserId(pool, user.userId);
  if (passwordHash === null) throw invalidCurrentPassword();
  if (!(await verifyPassword(input.currentPassword, passwordHash))) throw invalidCurrentPassword();

  await updatePasswordHash(pool, user.userId, await hashPassword(input.newPassword));
  const sessionsEnded = await deleteActiveRefreshTokens(
    pool,
    user.userId,
    currentRefreshToken === undefined ? undefined : hashRefreshToken(currentRefreshToken),
  );
  auditPasswordChanged({ user: user.uuidText, sessionsEnded, ip });
}

/**
 * Revokes the presented refresh token. Idempotent — an unknown token is a no-op.
 *
 * The owner is looked up purely so the audit line can name a user; without it
 * the only thing an ended session would say is that some cookie went away.
 * An unknown token still logs, as `user=unknown`: that is the shape of someone
 * sending a made-up cookie, which is worth seeing.
 */
export async function logout(
  pool: Pool,
  presentedToken: string | undefined,
  ip: SourceIp,
): Promise<void> {
  if (!presentedToken) return;
  const tokenHash = hashRefreshToken(presentedToken);
  const owner = await findRefreshTokenOwner(pool, tokenHash);
  await revokeRefreshToken(pool, tokenHash);
  auditLogout({ user: owner?.uuidText ?? null, ip });
}
