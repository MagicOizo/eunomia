import assert from 'node:assert/strict';
import test from 'node:test';

import { OIDC_TEST_FAILURES } from '@eunomia/shared';
import type * as client from 'openid-client';

import { describeOidcError, testOidcConnection } from './connection-test.js';
import type { OidcClientConfig, OidcDeps } from './provider.js';

const CONFIG: OidcClientConfig = {
  issuer: 'https://provider.example.com/application/o/eunomia/',
  clientId: 'eunomia-client',
  clientSecret: 'decrypted-secret',
};

const GOOD_METADATA = {
  issuer: CONFIG.issuer,
  id_token_signing_alg_values_supported: ['RS256'],
  jwks_uri: 'https://provider.example.com/application/o/eunomia/jwks/',
};

const RSA_KEY = { kty: 'RSA', use: 'sig', kid: 'k1', n: 'AQAB', e: 'AQAB' };

interface Recorded {
  discovery: unknown[][];
  fetch: unknown[][];
}

/** Stubs openid-client's `discovery` and fetch, keeping what they were called with. */
function stubs(options: {
  metadata?: Record<string, unknown>;
  discoveryError?: unknown;
  jwks?: unknown;
  jwksStatus?: number;
  fetchError?: unknown;
}): { deps: OidcDeps; recorded: Recorded } {
  const recorded: Recorded = { discovery: [], fetch: [] };
  const discovery = (async (...args: unknown[]) => {
    recorded.discovery.push(args);
    if (options.discoveryError !== undefined) throw options.discoveryError;
    const metadata = options.metadata ?? GOOD_METADATA;
    return { serverMetadata: () => metadata } as unknown as client.Configuration;
  }) as typeof client.discovery;
  const fetch = (async (...args: unknown[]) => {
    recorded.fetch.push(args);
    if (options.fetchError !== undefined) throw options.fetchError;
    const body = options.jwks ?? { keys: [RSA_KEY] };
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: options.jwksStatus ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { deps: { discovery, fetch }, recorded };
}

test('a provider with an asymmetric algorithm and a published key passes', async () => {
  const { deps, recorded } = stubs({});
  assert.deepEqual(await testOidcConnection(CONFIG, deps), { result: 'ok' });

  // openid-client receives the issuer as a URL, the client ID and the
  // decrypted secret (as the metadata string → client_secret_post).
  const [server, clientId, secret, auth, options] = recorded.discovery[0] ?? [];
  assert.ok(server instanceof URL);
  assert.equal(server.href, CONFIG.issuer);
  assert.equal(clientId, 'eunomia-client');
  assert.equal(secret, 'decrypted-secret');
  assert.equal(auth, undefined);
  assert.deepEqual(options, { timeout: 10 });

  // The key set is fetched from the document's jwks_uri, with a timeout of its own.
  const [url, init] = recorded.fetch[0] ?? [];
  assert.equal(String(url), GOOD_METADATA.jwks_uri);
  assert.ok((init as RequestInit).signal instanceof AbortSignal);
});

test('an unreachable provider fails discovery and keeps the system error code', async () => {
  const cause = Object.assign(new Error('getaddrinfo ENOTFOUND provider.example.com'), {
    code: 'ENOTFOUND',
  });
  const { deps, recorded } = stubs({
    discoveryError: new TypeError('fetch failed', { cause }),
  });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result, 'error');
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.DISCOVERY_FAILED);
  assert.match(outcome.result === 'error' ? outcome.detail : '', /ENOTFOUND/);
  assert.equal(recorded.fetch.length, 0);
});

test('a 404 on the discovery document names the status', async () => {
  const error = Object.assign(new Error('unexpected HTTP response status code'), {
    code: 'OAUTH_RESPONSE_IS_NOT_CONFORM',
    cause: new Response('nope', { status: 404 }),
  });
  const { deps } = stubs({ discoveryError: error });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.DISCOVERY_FAILED);
  assert.match(outcome.result === 'error' ? outcome.detail : '', /HTTP 404/);
});

test('Fund 1: a provider that only signs with HS256 fails although discovery answers', async () => {
  const { deps, recorded } = stubs({
    metadata: { ...GOOD_METADATA, id_token_signing_alg_values_supported: ['HS256'] },
  });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.NO_ASYMMETRIC_ALG);
  assert.match(outcome.result === 'error' ? outcome.detail : '', /HS256/);
  assert.equal(recorded.fetch.length, 0);
});

test('a document without signing algorithms is not taken on trust', async () => {
  const { deps } = stubs({ metadata: { issuer: CONFIG.issuer, jwks_uri: GOOD_METADATA.jwks_uri } });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.NO_ASYMMETRIC_ALG);
});

test('a document without jwks_uri fails', async () => {
  const { deps } = stubs({
    metadata: { issuer: CONFIG.issuer, id_token_signing_alg_values_supported: ['RS256'] },
  });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.NO_JWKS_URI);
});

test('a key set behind plain http is not fetched', async () => {
  const { deps, recorded } = stubs({
    metadata: { ...GOOD_METADATA, jwks_uri: 'http://provider.example.com/jwks/' },
  });
  const outcome = await testOidcConnection(CONFIG, deps);
  assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.JWKS_UNREACHABLE);
  assert.equal(recorded.fetch.length, 0);
});

test('a key set that times out, errors or is not JSON is unreachable', async () => {
  const cases = [
    stubs({ fetchError: new DOMException('The operation was aborted', 'TimeoutError') }),
    stubs({ jwksStatus: 500, jwks: { error: 'boom' } }),
    stubs({ jwks: 'not json at all' }),
    stubs({ jwks: { notKeys: true } }),
  ];
  for (const { deps } of cases) {
    const outcome = await testOidcConnection(CONFIG, deps);
    assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.JWKS_UNREACHABLE);
  }
});

test('Fund 1: an empty key set or one with only shared secrets fails', async () => {
  const cases = [
    stubs({ jwks: { keys: [] } }),
    stubs({ jwks: { keys: [{ kty: 'oct', k: 'c2VjcmV0' }] } }),
    stubs({ jwks: { keys: [{ ...RSA_KEY, use: 'enc' }] } }),
  ];
  for (const { deps } of cases) {
    const outcome = await testOidcConnection(CONFIG, deps);
    assert.equal(outcome.result === 'error' && outcome.cause, OIDC_TEST_FAILURES.JWKS_NO_KEYS);
  }
});

test('a key without a use counts, alongside the HMAC algorithm', async () => {
  const { deps } = stubs({
    metadata: { ...GOOD_METADATA, id_token_signing_alg_values_supported: ['HS256', 'ES256'] },
    jwks: { keys: [{ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }] },
  });
  assert.deepEqual(await testOidcConnection(CONFIG, deps), { result: 'ok' });
});

test('error descriptions walk the cause chain without repeating themselves', () => {
  const inner = Object.assign(new Error('self-signed certificate in certificate chain'), {
    code: 'SELF_SIGNED_CERT_IN_CHAIN',
  });
  assert.equal(
    describeOidcError(new TypeError('fetch failed', { cause: inner })),
    'fetch failed / SELF_SIGNED_CERT_IN_CHAIN: self-signed certificate in certificate chain',
  );
  assert.equal(describeOidcError('plain'), 'plain');
  assert.equal(describeOidcError(undefined), 'unknown error');
});
