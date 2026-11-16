import assert from 'node:assert/strict';
import test from 'node:test';

import { OIDC_CALLBACK_PATH, isOidcIssuer, oidcRedirectUri } from './oidc.js';

test('the redirect URI is the instance address plus the callback path', () => {
  assert.equal(
    oidcRedirectUri('https://eunomia.example.com'),
    `https://eunomia.example.com${OIDC_CALLBACK_PATH}`,
  );
});

test('trailing slashes of the instance address do not double up', () => {
  assert.equal(
    oidcRedirectUri('https://eunomia.example.com//'),
    'https://eunomia.example.com/api/v1/auth/oidc/callback',
  );
});

test('an issuer is an absolute https address', () => {
  assert.equal(isOidcIssuer('https://login.example.com/application/o/eunomia/'), true);
  assert.equal(isOidcIssuer('http://login.example.com/application/o/eunomia/'), false);
  assert.equal(isOidcIssuer('login.example.com'), false);
  assert.equal(isOidcIssuer(42), false);
});

test('the discovery document is not an issuer', () => {
  assert.equal(
    isOidcIssuer(
      'https://login.example.com/application/o/eunomia/.well-known/openid-configuration',
    ),
    false,
  );
});
