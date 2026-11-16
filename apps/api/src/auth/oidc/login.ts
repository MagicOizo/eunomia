import {
  OIDC_LOGIN_ERRORS,
  OIDC_SCOPES,
  type OidcLoginError,
  oidcRedirectUri,
} from '@eunomia/shared';
import type { Pool } from 'mariadb';

import type { AppConfig } from '../../config/env.js';
import { type SourceIp, auditLoginOk, auditOidcFailed, auditOidcLinked } from '../../lib/audit.js';
import { getSettings } from '../../settings/repository.js';
import type { ResolvedSettings } from '../../settings/registry.js';
import {
  type OidcCandidate,
  findUserByEmailForOidc,
  findUserByOidcSubject,
  linkOidcSubject,
} from '../repository.js';
import { type IssuedSession, issueSession } from '../service.js';
import { signFlowState, verifyFlowState } from './flow-state.js';
import {
  type OidcClientConfig,
  type OidcLoginDeps,
  defaultOidcLoginDeps,
  getOidcConfiguration,
  readOidcClientConfig,
} from './provider.js';

/**
 * The sign-in through the provider (Slice 88, Notes/eunomia-plan.md "Paket
 * Anmeldung über OIDC"): leaving for the provider, and coming back to a session
 * exactly like the one a password earns.
 *
 * Every way this can fail ends in one of the codes of OIDC_LOGIN_ERRORS, which
 * the route turns into `302 /login?oidcError=<code>`. Each failure writes an
 * AUTH_OIDC_FAILED line with what the code leaves out.
 *
 * No account is ever created on the way in, and no role is read from the
 * token: the provider decides who may come in, this application decides what
 * that someone may do.
 */

export type OidcOutcome<T> = { ok: true; value: T } | { ok: false; code: OidcLoginError };

/** The provider's configuration and the redirect URI, when the sign-in is switched on and complete. */
type Ready = { ok: true; client: OidcClientConfig; redirectUri: string };

function readReady(settings: ResolvedSettings): Ready | { ok: false; code: OidcLoginError } {
  if (settings['login.oidcEnabled'] !== true) {
    return { ok: false, code: OIDC_LOGIN_ERRORS.DISABLED };
  }
  const resolved = readOidcClientConfig(settings);
  const appUrl = settings['general.appUrl'];
  // The PUT refuses to switch on an incomplete configuration (settings/login.ts),
  // so this is a secret that no longer decrypts — a changed CONFIG_ENCRYPTION_KEY.
  if (!resolved.ok || typeof appUrl !== 'string' || appUrl.trim() === '') {
    return { ok: false, code: OIDC_LOGIN_ERRORS.UNAVAILABLE };
  }
  return { ok: true, client: resolved.config, redirectUri: oidcRedirectUri(appUrl) };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail<T>(
  code: OidcLoginError,
  ip: SourceIp,
  extra: { email?: string; detail?: string } = {},
): OidcOutcome<T> {
  auditOidcFailed({ reason: code, ip, ...extra });
  return { ok: false, code };
}

/**
 * Prepares the way out to the provider: the authorization URL to send the
 * browser to, and the signed flow state for the cookie.
 */
export async function startOidcLogin(
  pool: Pool,
  config: AppConfig,
  ip: SourceIp,
  deps: OidcLoginDeps = defaultOidcLoginDeps,
): Promise<OidcOutcome<{ url: URL; flowToken: string }>> {
  const ready = readReady(await getSettings(pool, config.configEncryptionKey));
  if (!ready.ok) return fail(ready.code, ip);

  let provider;
  try {
    provider = await getOidcConfiguration(ready.client, deps);
  } catch (error) {
    return fail(OIDC_LOGIN_ERRORS.UNAVAILABLE, ip, { detail: message(error) });
  }

  const flow = {
    state: deps.randomState(),
    nonce: deps.randomNonce(),
    codeVerifier: deps.randomPKCECodeVerifier(),
  };
  const url = deps.buildAuthorizationUrl(provider, {
    redirect_uri: ready.redirectUri,
    scope: OIDC_SCOPES,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await deps.calculatePKCECodeChallenge(flow.codeVerifier),
    code_challenge_method: 'S256',
  });
  return { ok: true, value: { url, flowToken: await signFlowState(flow, config.auth.jwtSecret) } };
}

/**
 * Finds the account for a provider identity. `sub` leads; only when no account
 * carries it does the address decide — once, after which the account carries
 * the `sub` (the caller links it).
 *
 * An account found by address that already carries a *different* `sub` is
 * refused rather than taken over. That happens for real when an account at the
 * provider is deleted and created again under the same address; overwriting
 * would hand this account to a foreign identity without anyone ever seeing it.
 */
async function resolveAccount(
  pool: Pool,
  subject: string,
  email: string,
): Promise<{ ok: true; user: OidcCandidate } | { ok: false; code: OidcLoginError }> {
  const user =
    (await findUserByOidcSubject(pool, subject)) ?? (await findUserByEmailForOidc(pool, email));
  // A deleted account (userStatus -1) waits for its retention period; to the
  // way in it no longer exists.
  if (user === null || user.userStatus === -1) {
    return { ok: false, code: OIDC_LOGIN_ERRORS.NO_ACCOUNT };
  }
  if (user.oidcSubject !== null && user.oidcSubject !== subject) {
    return { ok: false, code: OIDC_LOGIN_ERRORS.LINKED_ELSEWHERE };
  }
  if (user.userStatus !== 1) return { ok: false, code: OIDC_LOGIN_ERRORS.ACCOUNT_INACTIVE };
  return { ok: true, user };
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ER_DUP_ENTRY';
}

/**
 * The way back from the provider: checks the flow, exchanges the code, finds
 * the account and issues the session.
 *
 * `query` is the callback's raw query string (with its `?`). The URL handed to
 * the token exchange is built from `general.appUrl`, never from the request's
 * Host header (Blueprint, Fund 3): openid-client derives the `redirect_uri` of
 * the token request from it, and the provider compares that character by
 * character with the registered one.
 */
export async function finishOidcLogin(
  pool: Pool,
  config: AppConfig,
  input: { query: string; flowToken: string | undefined; ip: SourceIp },
  deps: OidcLoginDeps = defaultOidcLoginDeps,
): Promise<OidcOutcome<IssuedSession>> {
  const { ip } = input;
  // Switched off while someone was at the provider: that flow ends here.
  const ready = readReady(await getSettings(pool, config.configEncryptionKey));
  if (!ready.ok) return fail(ready.code, ip);

  const params = new URLSearchParams(input.query);
  const flow = await verifyFlowState(input.flowToken, config.auth.jwtSecret);
  if (flow === null) {
    return fail(OIDC_LOGIN_ERRORS.FLOW_INVALID, ip, { detail: 'missing or invalid flow cookie' });
  }
  if (params.get('state') !== flow.state) {
    return fail(OIDC_LOGIN_ERRORS.FLOW_INVALID, ip, { detail: 'state does not match' });
  }
  // Checked by us rather than left to the library's exception, whose class
  // would otherwise have to be told apart from every other failure.
  const providerError = params.get('error');
  if (providerError !== null) {
    const description = params.get('error_description');
    return fail(OIDC_LOGIN_ERRORS.DENIED, ip, {
      detail: description === null ? providerError : `${providerError}: ${description}`,
    });
  }

  let claims;
  try {
    const provider = await getOidcConfiguration(ready.client, deps);
    const callbackUrl = new URL(ready.redirectUri);
    callbackUrl.search = params.toString();
    const tokens = await deps.authorizationCodeGrant(provider, callbackUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    claims = tokens.claims();
  } catch (error) {
    return fail(OIDC_LOGIN_ERRORS.FAILED, ip, { detail: message(error) });
  }
  if (claims === undefined) {
    return fail(OIDC_LOGIN_ERRORS.FAILED, ip, { detail: 'no ID token' });
  }

  // `email_verified` is deliberately not demanded: the administrator chose the
  // provider, and the provider decides who gets in. Some providers (Authentik
  // among them, depending on the version and its scope mapping) send `false`
  // for every address, and the first link would never happen.
  const subject = claims.sub;
  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  if (email === '') return fail(OIDC_LOGIN_ERRORS.EMAIL_MISSING, ip);

  const resolved = await resolveAccount(pool, subject, email);
  if (!resolved.ok) return fail(resolved.code, ip, { email });
  const { user } = resolved;

  // Linked only once the sign-in is certain to succeed: a deactivated account
  // does not quietly acquire an identity it has never used.
  if (user.oidcSubject === null) {
    let linked: boolean;
    try {
      linked = await linkOidcSubject(pool, user.userId, subject);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      linked = false;
    }
    if (!linked) {
      return fail(OIDC_LOGIN_ERRORS.LINKED_ELSEWHERE, ip, {
        email,
        detail: 'linked concurrently',
      });
    }
    auditOidcLinked({ user: user.uuidText, ip });
  }

  auditLoginOk({ user: user.uuidText, ip, method: 'oidc' });
  return { ok: true, value: await issueSession(pool, config.auth, user) };
}
