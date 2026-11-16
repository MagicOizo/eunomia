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
