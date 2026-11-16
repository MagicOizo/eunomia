import * as client from 'openid-client';

import type { ResolvedSettings, SettingKey } from '../../settings/registry.js';

/**
 * The sign-in provider as the API talks to it (Notes/eunomia-plan.md, "Paket
 * Anmeldung über OIDC"): reading its configuration out of the settings and
 * fetching its discovery document — fresh for the connection test, cached for
 * the login route (Slice 88).
 *
 * The issuer is a configurable address, so the discovery call is a named
 * exception to I-11 ("outgoing calls go to fixed targets", Sicherheits-Review):
 * only MANAGE_SETTINGS can set it, it must be https (openid-client refuses
 * anything else as well), and a private CA is trusted through
 * NODE_EXTRA_CA_CERTS rather than by switching TLS checks off.
 */

/** Seconds — openid-client counts its timeout in seconds, not milliseconds. */
const DISCOVERY_TIMEOUT_S = 10;

/** What talking to the provider needs; `general.appUrl` is only needed for the login itself. */
export interface OidcClientConfig {
  issuer: string;
  clientId: string;
  /** Decrypted. It leaves this process only towards the provider. */
  clientSecret: string;
}

/**
 * The parts of openid-client this module uses, injectable so a test can stub
 * the library itself and hold on to what was handed to it — issuer, client ID
 * and the decrypted secret — instead of stubbing this module.
 */
export interface OidcDeps {
  discovery: typeof client.discovery;
  fetch: typeof globalThis.fetch;
}

export const defaultOidcDeps: OidcDeps = {
  discovery: client.discovery,
  fetch: (...args) => globalThis.fetch(...args),
};

const REQUIRED: ReadonlyArray<[SettingKey, keyof OidcClientConfig]> = [
  ['login.oidcIssuer', 'issuer'],
  ['login.oidcClientId', 'clientId'],
  ['login.oidcClientSecret', 'clientSecret'],
];

/**
 * The provider's configuration from resolved (decrypted) settings, or the keys
 * that are missing. A secret that cannot be decrypted resolves to null in
 * `getSettings` and therefore counts as missing here — it has to be entered again.
 */
export function readOidcClientConfig(
  settings: ResolvedSettings,
): { ok: true; config: OidcClientConfig } | { ok: false; missing: SettingKey[] } {
  const missing = REQUIRED.filter(([key]) => {
    const value = settings[key];
    return typeof value !== 'string' || value.trim() === '';
  }).map(([key]) => key);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: {
      issuer: String(settings['login.oidcIssuer']).trim(),
      clientId: String(settings['login.oidcClientId']).trim(),
      clientSecret: String(settings['login.oidcClientSecret']),
    },
  };
}

/**
 * Fetches the discovery document — the one place the decrypted secret is
 * handed over. It goes as the metadata string, which openid-client turns into
 * `client_secret_post`. The library appends the `.well-known` path itself and
 * checks that the document names the same issuer.
 */
export function discoverOidcProvider(
  config: OidcClientConfig,
  deps: OidcDeps = defaultOidcDeps,
): Promise<client.Configuration> {
  return deps.discovery(new URL(config.issuer), config.clientId, config.clientSecret, undefined, {
    timeout: DISCOVERY_TIMEOUT_S,
  });
}

/*
 * The discovery cache of the login route. The connection test never reads it:
 * a test answered from a cache would confirm an old success. Saving any `login.*`
 * key or `general.appUrl` throws it away (settings/routes.ts) — otherwise a
 * corrected issuer would only take effect after a restart. A failed discovery is
 * not remembered, so a short outage of the provider does not stay "broken" until
 * someone saves the form again.
 *
 * Module state rather than an injected object: the routers are built from
 * `(pool, config)` alone (API_MOUNTS in app.ts), and the settings router that
 * invalidates and the auth router that reads must see the same cache.
 */
let cached: client.Configuration | null = null;
let pending: Promise<client.Configuration> | null = null;
let generation = 0;

/** The provider's configuration for a login, discovered once and then reused. */
export function getOidcConfiguration(
  config: OidcClientConfig,
  deps: OidcDeps = defaultOidcDeps,
): Promise<client.Configuration> {
  if (cached !== null) return Promise.resolve(cached);
  if (pending !== null) return pending;

  // A save during this discovery bumps the generation: the result then belongs
  // to a configuration that no longer exists and must not land in the cache.
  const startedIn = generation;
  const attempt = discoverOidcProvider(config, deps)
    .then((discovered) => {
      if (generation === startedIn) cached = discovered;
      return discovered;
    })
    .finally(() => {
      if (pending === attempt) pending = null;
    });
  pending = attempt;
  return attempt;
}

/** Forgets the cached discovery; the next login discovers afresh. */
export function invalidateOidcDiscovery(): void {
  generation += 1;
  cached = null;
  pending = null;
}
