import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { ERROR_CODES, OIDC_TEST_FAILURES } from '@eunomia/shared';
import express from 'express';
import type * as client from 'openid-client';
import request from 'supertest';

import { createApp } from '../../app.js';
import { runMigrations } from '../../db/migrate.js';
import { errorHandler } from '../../lib/error-handler.js';
import { createSettingsRouter } from '../../settings/routes.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../../test/harness.js';
import type { OidcDeps } from './provider.js';

const ISSUER = 'https://provider.example.com/application/o/eunomia/';

interface SettingRow {
  key: string;
  value: unknown;
}

function value(body: { data: { settings: SettingRow[] } }, key: string): unknown {
  const row = body.data.settings.find((entry) => entry.key === key);
  assert.ok(row, `setting ${key} missing from the response`);
  return row.value;
}

/** openid-client and fetch as a provider that signs with `algs` and publishes `keys`. */
function provider(algs: string[], keys: unknown[], seen: unknown[][]): OidcDeps {
  return {
    discovery: (async (...args: unknown[]) => {
      seen.push(args);
      return {
        serverMetadata: () => ({
          issuer: ISSUER,
          id_token_signing_alg_values_supported: algs,
          jwks_uri: `${ISSUER}jwks/`,
        }),
      } as unknown as client.Configuration;
    }) as typeof client.discovery,
    fetch: (async () => Response.json({ keys })) as typeof globalThis.fetch,
  };
}

test('provider connection test: gating, incomplete config, recorded result, reset on change', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database, configEncryptionKey: randomBytes(32) });
    const app = createApp({ pool, config });
    const { admin } = await bootstrapAdmin(app);

    /** The settings router alone, with openid-client and fetch stubbed. */
    function stubbedApp(deps: OidcDeps): express.Express {
      const stubbed = express();
      stubbed.use(express.json());
      stubbed.use('/api/v1', createSettingsRouter(pool, config, { oidc: deps }));
      stubbed.use(errorHandler);
      return stubbed;
    }
    const write = (values: Record<string, unknown>) =>
      request(app).put('/api/v1/settings').set(admin).send({ values });
    const read = async () => (await request(app).get('/api/v1/settings').set(admin)).body;

    await t.test('without a session the test is refused', async () => {
      const res = await request(app).post('/api/v1/settings/login/test');
      assert.equal(res.status, 401);
    });

    await t.test('an incomplete configuration is a 409 and nothing is recorded', async () => {
      await write({ 'login.oidcIssuer': ISSUER });
      try {
        const res = await request(app).post('/api/v1/settings/login/test').set(admin);
        assert.equal(res.status, 409, JSON.stringify(res.body));
        assert.equal(res.body.error.code, ERROR_CODES.LOGIN_CONFIG_INCOMPLETE);
        assert.deepEqual(res.body.error.details.missing, [
          'login.oidcClientId',
          'login.oidcClientSecret',
        ]);
        assert.equal(value(await read(), 'login.oidcLastTestAt'), null);
      } finally {
        await write({ 'login.oidcIssuer': null });
      }
    });

    await t.test(
      'the result lands in the status keys, and a changed provider clears it',
      async () => {
        // Deliberately with the provider switched off: testing comes first.
        await write({
          'login.oidcIssuer': ISSUER,
          'login.oidcClientId': 'eunomia',
          'login.oidcClientSecret': 'provider-secret',
        });
        try {
          // Fund 1: discovery answers, but only HS256 and no key.
          const seen: unknown[][] = [];
          const red = await request(stubbedApp(provider(['HS256'], [], seen)))
            .post('/api/v1/settings/login/test')
            .set(admin);
          assert.equal(red.status, 200, JSON.stringify(red.body));
          assert.equal(red.body.data.status.lastTestResult, 'error');
          assert.equal(red.body.data.status.lastTestError, OIDC_TEST_FAILURES.NO_ASYMMETRIC_ALG);
          // openid-client got the stored values, the secret decrypted.
          assert.equal(String(seen[0]?.[0]), ISSUER);
          assert.equal(seen[0]?.[1], 'eunomia');
          assert.equal(seen[0]?.[2], 'provider-secret');

          let settings = await read();
          assert.equal(value(settings, 'login.oidcLastTestResult'), 'error');
          assert.equal(value(settings, 'login.oidcLastTestError'), 'no_asymmetric_alg');
          assert.match(String(value(settings, 'login.oidcLastTestDetail')), /HS256/);

          const green = await request(
            stubbedApp(provider(['RS256'], [{ kty: 'RSA', n: 'AQAB', e: 'AQAB' }], [])),
          )
            .post('/api/v1/settings/login/test')
            .set(admin);
          assert.equal(green.body.data.status.lastTestResult, 'ok');
          settings = await read();
          assert.equal(value(settings, 'login.oidcLastTestResult'), 'ok');
          assert.equal(value(settings, 'login.oidcLastTestError'), null);
          assert.equal(value(settings, 'login.oidcLastTestDetail'), null);
          assert.ok(value(settings, 'login.oidcLastTestAt'));

          // Saving the label or the same issuer again keeps the green.
          await write({ 'login.oidcButtonLabel': 'Company login', 'login.oidcIssuer': ISSUER });
          assert.equal(value(await read(), 'login.oidcLastTestResult'), 'ok');

          // A different issuer makes it describe something else: cleared.
          const changed = await write({
            'login.oidcIssuer': 'https://provider.example.com/application/o/other/',
          });
          assert.equal(changed.status, 200, JSON.stringify(changed.body));
          for (const key of [
            'login.oidcLastTestAt',
            'login.oidcLastTestResult',
            'login.oidcLastTestError',
            'login.oidcLastTestDetail',
          ]) {
            assert.equal(value(changed.body, key), null, key);
          }
        } finally {
          await write({
            'login.oidcIssuer': null,
            'login.oidcClientId': null,
            'login.oidcClientSecret': null,
            'login.oidcButtonLabel': null,
          });
        }
      },
    );
  } finally {
    await pool.end();
  }
});
