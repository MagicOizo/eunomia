import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { OIDC_CALLBACK_PATH, OIDC_LOGIN_ERRORS, OIDC_START_PATH } from '@eunomia/shared';
import express from 'express';
import type { Pool } from 'mariadb';
import type * as client from 'openid-client';
import request from 'supertest';

import { createApp } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { errorHandler } from '../../lib/error-handler.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../../test/harness.js';
import { hashPassword } from '../../lib/password.js';
import { createUser } from '../repository.js';
import { createAuthRouter } from '../routes.js';
import { invalidateOidcDiscovery, type OidcLoginDeps } from './provider.js';

/** Placeholders only — the repository is public. */
const ISSUER = 'https://provider.example.com/application/o/eunomia/';
const APP_URL = 'https://eunomia.example.com';
const SECRET = 'provider-secret';

type Claims = Record<string, unknown>;

/** What the stubbed openid-client saw, so the tests can hold on to it. */
interface Seen {
  discovery: unknown[][];
  grants: Array<{ url: URL; checks: client.AuthorizationCodeGrantChecks | undefined }>;
}

/**
 * openid-client stubbed as a provider that answers the token exchange with
 * `grant()` — claims, or a thrown error. The fixed state/nonce/verifier make the
 * flow cookie predictable without reaching into it.
 */
function provider(grant: () => Claims | Error, seen: Seen): OidcLoginDeps {
  const configuration = { issuer: ISSUER } as unknown as client.Configuration;
  return {
    discovery: (async (...args: unknown[]) => {
      seen.discovery.push(args);
      return configuration;
    }) as typeof client.discovery,
    fetch: globalThis.fetch,
    buildAuthorizationUrl: ((_config: client.Configuration, params: Record<string, string>) => {
      const url = new URL(`${ISSUER}authorize/`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return url;
    }) as typeof client.buildAuthorizationUrl,
    authorizationCodeGrant: (async (
      _config: client.Configuration,
      url: URL | Request,
      checks?: client.AuthorizationCodeGrantChecks,
    ) => {
      seen.grants.push({ url: url as URL, checks });
      const answer = grant();
      if (answer instanceof Error) throw answer;
      return { claims: () => answer };
    }) as unknown as typeof client.authorizationCodeGrant,
    randomState: () => 'the-state',
    randomNonce: () => 'the-nonce',
    randomPKCECodeVerifier: () => 'the-verifier',
    calculatePKCECodeChallenge: async (verifier: string) => `challenge-of-${verifier}`,
  };
}

/** The value of cookie `name` from a response's Set-Cookie headers, with its attributes. */
function setCookie(res: request.Response, name: string): string | undefined {
  const headers = res.headers['set-cookie'] as unknown as string[] | undefined;
  return headers?.find((line) => line.startsWith(`${name}=`));
}

function cookieValue(line: string | undefined): string {
  assert.ok(line, 'cookie not set');
  return line.slice(line.indexOf('=') + 1, line.indexOf(';'));
}

function oidcError(res: request.Response): string | null {
  assert.equal(res.status, 302, JSON.stringify(res.body));
  const location = new URL(res.headers.location as string, 'http://relative.invalid');
  assert.equal(location.pathname, '/login');
  return location.searchParams.get('oidcError');
}

async function oidcSubjectOf(pool: Pool, email: string): Promise<string | null> {
  const rows = await pool.query<Array<{ oidcSubject: string | null }>>(
    'SELECT oidcSubject FROM Users WHERE email = ?',
    [email],
  );
  return rows[0]?.oidcSubject ?? null;
}

test('sign-in through the provider: start, callback, account resolution', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);
    invalidateOidcDiscovery();

    const config = testConfig({ database, configEncryptionKey: randomBytes(32) });
    const app = createApp({ pool, config });
    const { admin } = await bootstrapAdmin(app);

    const write = async (values: Record<string, unknown>) => {
      const res = await request(app).put('/api/v1/settings').set(admin).send({ values });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    };

    let answer: () => Claims | Error = () => new Error('no answer set');
    const seen: Seen = { discovery: [], grants: [] };
    const stubbed = express();
    stubbed.use(
      '/api/v1',
      createAuthRouter(pool, config, { oidc: provider(() => answer(), seen) }),
    );
    stubbed.use(errorHandler);

    /** Runs start, then the callback with `query` (state defaults to the right one). */
    async function signIn(
      query: Record<string, string> = {},
      options: { cookie?: string | null } = {},
    ): Promise<request.Response> {
      const start = await request(stubbed).get(OIDC_START_PATH);
      assert.equal(start.status, 302);
      const flow = cookieValue(setCookie(start, 'oidc_flow'));
      const params = new URLSearchParams({ code: 'the-code', state: 'the-state', ...query });
      const callback = request(stubbed)
        .get(`${OIDC_CALLBACK_PATH}?${params.toString()}`)
        // A Host header from outside — the token exchange must not use it.
        .set('Host', 'attacker.example.net');
      const cookie = options.cookie === undefined ? `oidc_flow=${flow}` : options.cookie;
      return cookie === null ? callback : callback.set('Cookie', cookie);
    }

    const member = await createUser(pool, {
      email: 'member@example.com',
      firstname: 'Mia',
      surname: null,
      passwordHash: await hashPassword('memberpass1'),
    });

    await t.test('switched off, the start goes back to the login page', async () => {
      const res = await request(stubbed).get(OIDC_START_PATH);
      assert.equal(oidcError(res), OIDC_LOGIN_ERRORS.DISABLED);
      assert.equal(setCookie(res, 'oidc_flow'), undefined);
    });

    await write({
      'general.appUrl': APP_URL,
      'login.oidcIssuer': ISSUER,
      'login.oidcClientId': 'eunomia-client',
      'login.oidcClientSecret': SECRET,
      'login.oidcEnabled': true,
    });

    await t.test('an unreachable provider is "unavailable" and not remembered', async () => {
      const failing = express();
      const deps = provider(() => ({}), { discovery: [], grants: [] });
      deps.discovery = (async () => {
        throw new Error('getaddrinfo ENOTFOUND provider.example.com');
      }) as typeof client.discovery;
      failing.use('/api/v1', createAuthRouter(pool, config, { oidc: deps }));
      const res = await request(failing).get(OIDC_START_PATH);
      assert.equal(oidcError(res), OIDC_LOGIN_ERRORS.UNAVAILABLE);
    });

    await t.test('the start sends the browser to the provider with a flow cookie', async () => {
      const res = await request(stubbed).get(OIDC_START_PATH);
      assert.equal(res.status, 302);
      const location = new URL(res.headers.location as string);
      assert.equal(location.origin + location.pathname, `${ISSUER}authorize/`);
      assert.equal(location.searchParams.get('redirect_uri'), `${APP_URL}${OIDC_CALLBACK_PATH}`);
      assert.equal(location.searchParams.get('scope'), 'openid profile email');
      assert.equal(location.searchParams.get('state'), 'the-state');
      assert.equal(location.searchParams.get('nonce'), 'the-nonce');
      assert.equal(location.searchParams.get('code_challenge'), 'challenge-of-the-verifier');
      assert.equal(location.searchParams.get('code_challenge_method'), 'S256');

      const cookie = setCookie(res, 'oidc_flow') ?? '';
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\/api\/v1\/auth\/oidc/);
      assert.match(cookie, /Max-Age=600/);

      // Issuer, client ID and the decrypted secret reached openid-client.
      const [issuer, clientId, secret] = seen.discovery[0] ?? [];
      assert.equal(String(issuer), ISSUER);
      assert.equal(clientId, 'eunomia-client');
      assert.equal(secret, SECRET);
    });

    await t.test('a missing, forged or mismatched flow is "flow_invalid"', async () => {
      answer = () => ({ sub: 'sub-member', email: 'member@example.com' });
      assert.equal(oidcError(await signIn({}, { cookie: null })), OIDC_LOGIN_ERRORS.FLOW_INVALID);
      assert.equal(
        oidcError(await signIn({}, { cookie: 'oidc_flow=forged.token.value' })),
        OIDC_LOGIN_ERRORS.FLOW_INVALID,
      );
      assert.equal(oidcError(await signIn({ state: 'other' })), OIDC_LOGIN_ERRORS.FLOW_INVALID);
      assert.equal(await oidcSubjectOf(pool, 'member@example.com'), null);
    });

    await t.test('the callback drops the flow cookie whatever the outcome', async () => {
      const res = await signIn({ state: 'other' });
      assert.match(setCookie(res, 'oidc_flow') ?? '', /Expires=Thu, 01 Jan 1970/);
    });

    await t.test('the provider refusing is "denied"', async () => {
      const res = await signIn({ error: 'access_denied' });
      assert.equal(oidcError(res), OIDC_LOGIN_ERRORS.DENIED);
    });

    await t.test('a failing token exchange is "failed"', async () => {
      answer = () => new Error('unexpected ID Token "nonce" claim value');
      assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.FAILED);
    });

    await t.test('an ID token without an address is "email_missing"', async () => {
      answer = () => ({ sub: 'sub-member' });
      assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.EMAIL_MISSING);
    });

    await t.test('an identity without an account here is "no_account"', async () => {
      answer = () => ({ sub: 'sub-stranger', email: 'stranger@example.com' });
      assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.NO_ACCOUNT);
    });

    await t.test('a deleted account counts as none', async () => {
      await createUser(pool, {
        email: 'gone@example.com',
        firstname: 'Gina',
        surname: null,
        passwordHash: await hashPassword('gonepass1'),
      });
      await pool.query(
        "UPDATE Users SET userStatus = -1, deletedAt = NOW(6) WHERE email = 'gone@example.com'",
      );
      answer = () => ({ sub: 'sub-gone', email: 'gone@example.com' });
      assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.NO_ACCOUNT);
      assert.equal(await oidcSubjectOf(pool, 'gone@example.com'), null);
    });

    await t.test('a deactivated account is "account_inactive" and is not linked', async () => {
      await pool.query('UPDATE Users SET userStatus = 0 WHERE userID = ?', [member.userId]);
      try {
        answer = () => ({ sub: 'sub-member', email: 'member@example.com' });
        assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.ACCOUNT_INACTIVE);
        assert.equal(await oidcSubjectOf(pool, 'member@example.com'), null);
      } finally {
        await pool.query('UPDATE Users SET userStatus = 1 WHERE userID = ?', [member.userId]);
      }
    });

    await t.test('the first sign-in links by address and issues a session', async () => {
      seen.grants.length = 0;
      answer = () => ({ sub: 'sub-member', email: 'Member@Example.com' });
      const res = await signIn();
      assert.equal(res.status, 302);
      assert.equal(res.headers.location, '/');
      assert.equal(await oidcSubjectOf(pool, 'member@example.com'), 'sub-member');

      // The token exchange got the configured address plus the query — not the Host header.
      const grant = seen.grants[0];
      assert.ok(grant);
      assert.equal(grant.url.origin + grant.url.pathname, `${APP_URL}${OIDC_CALLBACK_PATH}`);
      assert.equal(grant.url.searchParams.get('code'), 'the-code');
      assert.equal(grant.url.searchParams.get('state'), 'the-state');
      assert.deepEqual(grant.checks, {
        pkceCodeVerifier: 'the-verifier',
        expectedState: 'the-state',
        expectedNonce: 'the-nonce',
        idTokenExpected: true,
      });

      // No access token in the URL; the refresh cookie turns into one as on any bootstrap.
      assert.doesNotMatch(String(res.headers.location), /token/i);
      const refreshCookie = cookieValue(setCookie(res, 'refresh_token'));
      const refreshed = await request(stubbed)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${refreshCookie}`);
      assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
      assert.equal(refreshed.body.user.email, 'member@example.com');
      assert.ok(refreshed.body.accessToken);
    });

    await t.test('after linking, `sub` leads even when the address changed', async () => {
      answer = () => ({ sub: 'sub-member', email: 'renamed@example.com' });
      const res = await signIn();
      assert.equal(res.headers.location, '/');
    });

    await t.test('an account linked to another identity is refused, not taken over', async () => {
      answer = () => ({ sub: 'sub-someone-else', email: 'member@example.com' });
      assert.equal(oidcError(await signIn()), OIDC_LOGIN_ERRORS.LINKED_ELSEWHERE);
      assert.equal(await oidcSubjectOf(pool, 'member@example.com'), 'sub-member');
    });

    await t.test('switched off mid-flow, the callback ends the flow', async () => {
      answer = () => ({ sub: 'sub-member', email: 'member@example.com' });
      const start = await request(stubbed).get(OIDC_START_PATH);
      const flow = cookieValue(setCookie(start, 'oidc_flow'));
      await write({ 'login.oidcEnabled': false });
      const res = await request(stubbed)
        .get(`${OIDC_CALLBACK_PATH}?code=c&state=the-state`)
        .set('Cookie', `oidc_flow=${flow}`);
      assert.equal(oidcError(res), OIDC_LOGIN_ERRORS.DISABLED);
    });
  } finally {
    invalidateOidcDiscovery();
    await resetData(pool);
    await pool.end();
  }
});

test('the sign-in limiter answers with a redirect, not with JSON', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;
  try {
    await runMigrations(pool);
    await resetData(pool);
    const base = testConfig({ database });
    const app = createApp({
      pool,
      config: { ...base, rateLimit: { ...base.rateLimit, oidcMax: 2, oidcWindowMs: 60_000 } },
    });
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).get(OIDC_START_PATH);
      assert.equal(oidcError(res), OIDC_LOGIN_ERRORS.DISABLED);
    }
    const limited = await request(app).get(OIDC_START_PATH);
    assert.equal(oidcError(limited), OIDC_LOGIN_ERRORS.RATE_LIMITED);
  } finally {
    await resetData(pool);
    await pool.end();
  }
});
