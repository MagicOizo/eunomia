import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OIDC_CALLBACK_PATH,
  OIDC_LOGIN_ERRORS,
  OIDC_START_PATH,
  isAsymmetricJwsAlg,
  isOidcIssuer,
  isOidcLoginError,
  isOidcTestFailure,
  oidcRedirectUri,
} from './oidc.js';

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

test('the asymmetric signature algorithms count, the HMAC family does not', () => {
  for (const alg of ['RS256', 'RS512', 'PS384', 'ES256', 'ES256K', 'EdDSA', 'Ed25519']) {
    assert.equal(isAsymmetricJwsAlg(alg), true, alg);
  }
  for (const alg of ['HS256', 'HS512', 'none', 'RS', 'rs256', '', null, 256]) {
    assert.equal(isAsymmetricJwsAlg(alg), false, String(alg));
  }
});

test('only the documented failure codes are recognised', () => {
  assert.equal(isOidcTestFailure('jwks_no_keys'), true);
  assert.equal(isOidcTestFailure('discovery_failed'), true);
  assert.equal(isOidcTestFailure('something else'), false);
  assert.equal(isOidcTestFailure(null), false);
});

test('login error codes are recognised, anything else is not', () => {
  for (const code of Object.values(OIDC_LOGIN_ERRORS)) assert.equal(isOidcLoginError(code), true);
  assert.equal(isOidcLoginError('access_denied'), false);
  assert.equal(isOidcLoginError(undefined), false);
});

test('start and callback live under the same cookie path', () => {
  const prefix = '/api/v1/auth/oidc/';
  assert.ok(OIDC_START_PATH.startsWith(prefix));
  assert.ok(OIDC_CALLBACK_PATH.startsWith(prefix));
});
