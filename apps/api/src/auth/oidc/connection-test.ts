import { OIDC_TEST_FAILURES, type OidcTestFailure, isAsymmetricJwsAlg } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { logEvent } from '../../lib/log.js';
import type { ResolvedSettings, SettingKey, SettingValue } from '../../settings/registry.js';
import { setApplicationValues } from '../../settings/repository.js';
import {
  type OidcClientConfig,
  type OidcDeps,
  defaultOidcDeps,
  discoverOidcProvider,
} from './provider.js';

/**
 * The connection test of the sign-in provider (Slice 86). Its green is the
 * evidence that switching the password login off relies on (Slice 90), so it
 * looks past the discovery document: Authentik without a signing certificate
 * answers discovery cleanly, signs ID tokens with HS256 and publishes no key
 * (Blueprint, Fund 1). The test therefore also asks which algorithms the
 * provider signs with and whether its key set holds a key.
 */

/** Milliseconds for the key set, which is fetched here rather than by openid-client. */
const JWKS_TIMEOUT_MS = 10_000;

/** Long enough for any error chain worth reading, short enough for a status line. */
const DETAIL_MAX_LENGTH = 500;

/** Key types a signature can be checked with; `oct` is a shared secret. */
const ASYMMETRIC_KEY_TYPES = new Set(['RSA', 'EC', 'OKP']);

export type OidcTestOutcome =
  { result: 'ok' } | { result: 'error'; cause: OidcTestFailure; detail: string };

/** What the status keys say, in the shape the API answers with. */
export interface OidcTestStatus {
  lastTestAt: string | null;
  lastTestResult: 'ok' | 'error' | null;
  lastTestError: string | null;
  lastTestDetail: string | null;
}

/** The status keys of the test, in the order of `OidcTestStatus`. */
export const OIDC_TEST_STATUS_KEYS: readonly SettingKey[] = [
  'login.oidcLastTestAt',
  'login.oidcLastTestResult',
  'login.oidcLastTestError',
  'login.oidcLastTestDetail',
];

function fail(cause: OidcTestFailure, detail: string): OidcTestOutcome {
  return { result: 'error', cause, detail: detail.slice(0, DETAIL_MAX_LENGTH) };
}

/**
 * Flattens what fetch and openid-client throw into one readable line. The
 * useful part sits at different depths: "fetch failed" carries the system
 * error (`ENOTFOUND`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) as its cause, and a
 * non-conforming answer carries the Response with its status.
 */
export function describeOidcError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof Response) {
      parts.push(`HTTP ${current.status}`);
      break;
    }
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      parts.push(typeof code === 'string' ? `${code}: ${current.message}` : current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === 'string') parts.push(current);
    break;
  }
  const unique = parts.filter((part, index) => part !== '' && parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(' / ') : 'unknown error';
}

/** Fetches the key set with its own timeout and judges what it holds. */
async function checkKeySet(jwksUri: string, deps: OidcDeps): Promise<OidcTestOutcome> {
  let url: URL;
  try {
    url = new URL(jwksUri);
  } catch {
    return fail(OIDC_TEST_FAILURES.JWKS_UNREACHABLE, `not a URL: ${jwksUri}`);
  }
  // The address comes from the provider's own document; it is held to the same
  // rule as the issuer (I-11 exception, see provider.ts).
  if (url.protocol !== 'https:') {
    return fail(OIDC_TEST_FAILURES.JWKS_UNREACHABLE, `not an https address: ${jwksUri}`);
  }

  let body: unknown;
  try {
    const response = await deps.fetch(url, {
      headers: { Accept: 'application/json, application/jwk-set+json' },
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (!response.ok) return fail(OIDC_TEST_FAILURES.JWKS_UNREACHABLE, `HTTP ${response.status}`);
    body = await response.json();
  } catch (error) {
    return fail(OIDC_TEST_FAILURES.JWKS_UNREACHABLE, describeOidcError(error));
  }

  const keys =
    typeof body === 'object' && body !== null && Array.isArray((body as { keys?: unknown }).keys)
      ? ((body as { keys: unknown[] }).keys as unknown[])
      : null;
  if (keys === null) {
    return fail(OIDC_TEST_FAILURES.JWKS_UNREACHABLE, 'the answer is not a JSON Web Key Set');
  }
  const usable = keys.filter((key) => {
    if (typeof key !== 'object' || key === null) return false;
    const { kty, use } = key as { kty?: unknown; use?: unknown };
    return (
      typeof kty === 'string' &&
      ASYMMETRIC_KEY_TYPES.has(kty) &&
      (use === undefined || use === 'sig')
    );
  });
  if (usable.length === 0) {
    return fail(
      OIDC_TEST_FAILURES.JWKS_NO_KEYS,
      `${keys.length} key(s) published, none usable for signatures`,
    );
  }
  return { result: 'ok' };
}

/**
 * Runs the test against the provider: discovery without the cache, then the
 * advertised signing algorithms, then the key set. Never throws for a provider
 * problem — a red result is the answer.
 */
export async function testOidcConnection(
  config: OidcClientConfig,
  deps: OidcDeps = defaultOidcDeps,
): Promise<OidcTestOutcome> {
  let metadata: Readonly<Record<string, unknown>>;
  try {
    metadata = (await discoverOidcProvider(config, deps)).serverMetadata();
  } catch (error) {
    return fail(OIDC_TEST_FAILURES.DISCOVERY_FAILED, describeOidcError(error));
  }

  const algorithms = metadata.id_token_signing_alg_values_supported;
  const advertised = Array.isArray(algorithms) ? algorithms.map(String) : [];
  if (!advertised.some(isAsymmetricJwsAlg)) {
    return fail(
      OIDC_TEST_FAILURES.NO_ASYMMETRIC_ALG,
      advertised.length > 0
        ? `id_token_signing_alg_values_supported: ${advertised.join(', ')}`
        : 'id_token_signing_alg_values_supported is missing',
    );
  }

  const jwksUri = metadata.jwks_uri;
  if (typeof jwksUri !== 'string' || jwksUri === '') {
    return fail(OIDC_TEST_FAILURES.NO_JWKS_URI, 'jwks_uri is missing');
  }
  return checkKeySet(jwksUri, deps);
}

/** Reads the status keys back; a hand-edited result word counts as no status. */
export function readOidcTestStatus(settings: ResolvedSettings): OidcTestStatus {
  const result = settings['login.oidcLastTestResult'];
  const asText = (value: SettingValue): string | null => (typeof value === 'string' ? value : null);
  return {
    lastTestAt: asText(settings['login.oidcLastTestAt']),
    lastTestResult: result === 'ok' || result === 'error' ? result : null,
    lastTestError: asText(settings['login.oidcLastTestError']),
    lastTestDetail: asText(settings['login.oidcLastTestDetail']),
  };
}

/**
 * Runs the test and records it in the status keys, which only the application
 * writes (`setApplicationValues` passes the readonly guard the API applies to
 * client writes). Logged under one greppable name either way — with issuer,
 * cause and detail, never the secret.
 */
export async function runOidcConnectionTest(
  pool: Pool,
  config: OidcClientConfig,
  deps: OidcDeps = defaultOidcDeps,
  now: () => Date = () => new Date(),
): Promise<OidcTestStatus> {
  const outcome = await testOidcConnection(config, deps);
  const status: OidcTestStatus =
    outcome.result === 'ok'
      ? {
          lastTestAt: now().toISOString(),
          lastTestResult: 'ok',
          lastTestError: null,
          lastTestDetail: null,
        }
      : {
          lastTestAt: now().toISOString(),
          lastTestResult: 'error',
          lastTestError: outcome.cause,
          lastTestDetail: outcome.detail,
        };

  if (outcome.result === 'ok') {
    logEvent('info', 'OIDC_TEST_OK', { issuer: config.issuer });
  } else {
    logEvent('warn', 'OIDC_TEST_FAILED', {
      issuer: config.issuer,
      cause: outcome.cause,
      detail: outcome.detail,
    });
  }

  await setApplicationValues(
    pool,
    new Map<SettingKey, SettingValue>([
      ['login.oidcLastTestAt', status.lastTestAt],
      ['login.oidcLastTestResult', status.lastTestResult],
      ['login.oidcLastTestError', status.lastTestError],
      ['login.oidcLastTestDetail', status.lastTestDetail],
    ]),
  );
  return status;
}
