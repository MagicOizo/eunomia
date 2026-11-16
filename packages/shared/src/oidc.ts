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

/**
 * The start of the sign-in through the provider (Slice 88). The login page links
 * here (Slice 89) — a link, not a form: the CSP's `form-action 'self'` would
 * stop Chromium from following a form's redirect to the provider.
 */
export const OIDC_START_PATH = '/api/v1/auth/oidc/start';

/**
 * What the sign-in asks the provider for, and nothing more. `email` is not
 * optional — the first link to an account goes through the address — and some
 * providers (Authentik) put the address into the ID token only with `profile`.
 * Every further scope would show up on the user's consent screen; there are no
 * roles or groups to fetch, because the provider decides who gets in and the
 * application decides what that someone may do.
 */
export const OIDC_SCOPES = 'openid profile email';

/**
 * Why a sign-in through the provider did not end in a session (Slice 88). The
 * browser is navigating, so the API answers with `302 /login?oidcError=<code>`
 * instead of a JSON error; the login page turns the code into a sentence in the
 * reader's language (Slice 89). The codes are the contract between the two —
 * whatever falls outside them becomes `failed`, and its detail stays in the log.
 */
export const OIDC_LOGIN_ERRORS = {
  /** The provider is switched off — also when it was switched off mid-flow. */
  DISABLED: 'disabled',
  /** The configuration is incomplete, or the provider could not be reached. */
  UNAVAILABLE: 'unavailable',
  /** The flow cookie is missing, expired or forged, or the `state` does not match it. */
  FLOW_INVALID: 'flow_invalid',
  /** The provider answered with an error (the user declined, or it refused the client). */
  DENIED: 'denied',
  /** The ID token carries no e-mail address to find the account by. */
  EMAIL_MISSING: 'email_missing',
  /** No account here belongs to this identity — accounts are never created on the way in. */
  NO_ACCOUNT: 'no_account',
  /** The account exists but is deactivated. */
  ACCOUNT_INACTIVE: 'account_inactive',
  /**
   * The account with this address is already linked to a different identity at
   * the provider — refused rather than overwritten (Blueprint §2). Undone by
   * "unlink" in the user administration (Slice 91).
   */
  LINKED_ELSEWHERE: 'linked_elsewhere',
  /** Too many sign-in attempts from this address in a short time. */
  RATE_LIMITED: 'rate_limited',
  /** Anything else: the token exchange, the signature, the nonce. */
  FAILED: 'failed',
} as const;

export type OidcLoginError = (typeof OIDC_LOGIN_ERRORS)[keyof typeof OIDC_LOGIN_ERRORS];

const OIDC_LOGIN_ERROR_VALUES: readonly string[] = Object.values(OIDC_LOGIN_ERRORS);

/** Whether a value from the URL is one of the codes above. */
export function isOidcLoginError(value: unknown): value is OidcLoginError {
  return typeof value === 'string' && OIDC_LOGIN_ERROR_VALUES.includes(value);
}

/**
 * Which ways in the login page offers (Slice 89), answered by the public
 * `GET /login-options`. It says only what the page needs to draw itself —
 * never the issuer, the client or the state of the last test: whoever asks has
 * not signed in yet.
 */
export interface LoginOptions {
  /**
   * Whether the password form is shown. Always true until the password sign-in
   * can be switched off (Slice 90); the field is in the contract from the start
   * so the page does not have to change shape then.
   */
  password: boolean;
  /**
   * The button to the sign-in provider, or null when there is none. A null
   * label leaves the text to the web's own default in the reader's language.
   */
  oidc: { label: string | null } | null;
}
