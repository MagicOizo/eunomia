import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import test from 'node:test';

import type * as client from 'openid-client';

import type { ResolvedSettings } from '../../settings/registry.js';
import {
  type OidcClientConfig,
  type OidcDeps,
  getOidcConfiguration,
  invalidateOidcDiscovery,
  readOidcClientConfig,
} from './provider.js';

const CONFIG: OidcClientConfig = {
  issuer: 'https://provider.example.com/application/o/eunomia/',
  clientId: 'eunomia-client',
  clientSecret: 'decrypted-secret',
};

afterEach(() => invalidateOidcDiscovery());

/** A discovery stub whose calls are counted and whose answers are controlled per call. */
function countingDeps(answers: Array<() => Promise<client.Configuration>>): {
  deps: OidcDeps;
  calls: () => number;
} {
  let count = 0;
  const discovery = (async () => {
    const answer = answers[Math.min(count, answers.length - 1)];
    count += 1;
    assert.ok(answer);
    return answer();
  }) as unknown as typeof client.discovery;
  return { deps: { discovery, fetch: globalThis.fetch }, calls: () => count };
}

const configuration = (name: string): client.Configuration =>
  ({ name }) as unknown as client.Configuration;

test('the client configuration is read from resolved settings', () => {
  const settings = {
    'login.oidcIssuer': ` ${CONFIG.issuer} `,
    'login.oidcClientId': 'eunomia-client',
    'login.oidcClientSecret': 'decrypted-secret',
  } as unknown as ResolvedSettings;
  assert.deepEqual(readOidcClientConfig(settings), { ok: true, config: CONFIG });
});

test('missing or blank parts are named, the instance address is not needed', () => {
  const settings = {
    'login.oidcIssuer': CONFIG.issuer,
    'login.oidcClientId': '  ',
    'login.oidcClientSecret': null,
    'general.appUrl': null,
  } as unknown as ResolvedSettings;
  assert.deepEqual(readOidcClientConfig(settings), {
    ok: false,
    missing: ['login.oidcClientId', 'login.oidcClientSecret'],
  });
});

test('a successful discovery is cached for the login', async () => {
  const { deps, calls } = countingDeps([async () => configuration('first')]);
  const first = await getOidcConfiguration(CONFIG, deps);
  const second = await getOidcConfiguration(CONFIG, deps);
  assert.equal(first, second);
  assert.equal(calls(), 1);
});

test('concurrent logins share one discovery', async () => {
  const { deps, calls } = countingDeps([async () => configuration('shared')]);
  const [a, b] = await Promise.all([
    getOidcConfiguration(CONFIG, deps),
    getOidcConfiguration(CONFIG, deps),
  ]);
  assert.equal(a, b);
  assert.equal(calls(), 1);
});

test('a failed discovery is not remembered', async () => {
  const { deps, calls } = countingDeps([
    async () => {
      throw new Error('provider down');
    },
    async () => configuration('recovered'),
  ]);
  await assert.rejects(getOidcConfiguration(CONFIG, deps), /provider down/);
  const next = await getOidcConfiguration(CONFIG, deps);
  assert.equal((next as unknown as { name: string }).name, 'recovered');
  assert.equal(calls(), 2);
});

test('invalidating forces a fresh discovery', async () => {
  const { deps, calls } = countingDeps([
    async () => configuration('old'),
    async () => configuration('new'),
  ]);
  await getOidcConfiguration(CONFIG, deps);
  invalidateOidcDiscovery();
  const next = await getOidcConfiguration(CONFIG, deps);
  assert.equal((next as unknown as { name: string }).name, 'new');
  assert.equal(calls(), 2);
});

test('a discovery that was running during a save does not land in the cache', async () => {
  let release: (value: client.Configuration) => void = () => undefined;
  const { deps, calls } = countingDeps([
    () =>
      new Promise<client.Configuration>((resolve) => {
        release = resolve;
      }),
    async () => configuration('after save'),
  ]);
  const stale = getOidcConfiguration(CONFIG, deps);
  invalidateOidcDiscovery();
  release(configuration('before save'));
  await stale;

  const next = await getOidcConfiguration(CONFIG, deps);
  assert.equal((next as unknown as { name: string }).name, 'after save');
  assert.equal(calls(), 2);
});
