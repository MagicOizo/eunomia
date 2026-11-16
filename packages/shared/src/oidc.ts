/**
 * Sign-in through an OpenID Connect provider (Notes/eunomia-plan.md, "Paket
 * Anmeldung über OIDC"). What both sides spell: the path the provider sends the
 * browser back to, and the rule an issuer address has to follow.
 */

/**
 * The callback route. The provider compares the redirect URI character by
 * character with the one registered there, so the route the API answers on and
 * the line the settings page offers for copying come from this one constant —
 * they cannot drift apart.
 */
export const OIDC_CALLBACK_PATH = '/api/v1/auth/oidc/callback';

/**
 * The redirect URI for an instance reachable at `appUrl` (`general.appUrl`).
 * Built from the configured address and never from the request's Host header:
 * a value from the request is one an outsider can influence, and an instance
 * reachable under a second name would present a URI the provider rejects.
 */
export function oidcRedirectUri(appUrl: string): string {
  return `${appUrl.trim().replace(/\/+$/, '')}${OIDC_CALLBACK_PATH}`;
}

/**
 * Whether `value` can be an issuer: an absolute https address that is not the
 * discovery document itself. The discovery path is appended by the client, which
 * then checks that the document names the same issuer — entering the
 * `.well-known` address would quietly switch that check off. Plain http is
 * refused because the OIDC client refuses it as well; a provider behind a
 * private CA is reached through NODE_EXTRA_CA_CERTS, not by dropping TLS.
 */
export function isOidcIssuer(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && !url.pathname.includes('/.well-known/');
}

/**
 * Why a connection test of the provider failed (Slice 86) — stored in
 * `login.oidcLastTestError`, while `login.oidcLastTestDetail` keeps the raw
 * technical text (ENOTFOUND, HTTP 404, a certificate error). The settings page
 * turns the code into a sentence in the reader's language and appends the
 * detail; the codes are the contract between the two.
 */
export const OIDC_TEST_FAILURES = {
  /** The discovery document could not be fetched or did not conform (address, TLS, 404, issuer mismatch). */
  DISCOVERY_FAILED: 'discovery_failed',
  /**
   * The provider names no asymmetric algorithm for signing ID tokens. Authentik
   * without a signing certificate signs with HS256 and publishes no key, while
   * its discovery answers cleanly — the most common stumbling block of all.
   */
  NO_ASYMMETRIC_ALG: 'no_asymmetric_alg',
  /** The discovery document names no `jwks_uri`. */
  NO_JWKS_URI: 'no_jwks_uri',
  /** The key set could not be fetched (unreachable, timeout, not https, not JSON). */
  JWKS_UNREACHABLE: 'jwks_unreachable',
  /** The key set holds no key an ID token signature could be checked with. */
  JWKS_NO_KEYS: 'jwks_no_keys',
} as const;

export type OidcTestFailure = (typeof OIDC_TEST_FAILURES)[keyof typeof OIDC_TEST_FAILURES];

const OIDC_TEST_FAILURE_VALUES: readonly string[] = Object.values(OIDC_TEST_FAILURES);

/** Whether a stored value is one of the codes above (a hand-edited row is not). */
export function isOidcTestFailure(value: unknown): value is OidcTestFailure {
  return typeof value === 'string' && OIDC_TEST_FAILURE_VALUES.includes(value);
}

/**
 * Whether `alg` is a JWS algorithm whose signatures can be checked against a
 * published public key: RSA (RS*, PS*), elliptic curves (ES*) and EdDSA. The
 * HMAC family (HS*) is keyed with the client secret and publishes nothing — a
 * provider that only offers it cannot be verified the way the login expects.
 */
export function isAsymmetricJwsAlg(alg: unknown): boolean {
  return (
    typeof alg === 'string' &&
    /^(?:RS(?:256|384|512)|PS(?:256|384|512)|ES(?:256|384|512|256K)|EdDSA|Ed25519|Ed448)$/.test(alg)
  );
}
