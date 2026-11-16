import assert from 'node:assert/strict';
import test from 'node:test';

import { SignJWT } from 'jose';

import { signAccessToken, verifyAccessToken } from '../tokens.js';
import { readFlowCookie, signFlowState, verifyFlowState } from './flow-state.js';

const SECRET = 'flow-state-test-secret';
const FLOW = { state: 'st-1', nonce: 'no-1', codeVerifier: 'cv-1' };

test('a signed flow state verifies back to what went in', async () => {
  const token = await signFlowState(FLOW, SECRET);
  assert.deepEqual(await verifyFlowState(token, SECRET), FLOW);
});

test('a missing, forged or foreign-keyed flow state is null', async () => {
  const token = await signFlowState(FLOW, SECRET);
  assert.equal(await verifyFlowState(undefined, SECRET), null);
  assert.equal(await verifyFlowState('', SECRET), null);
  assert.equal(await verifyFlowState(`${token}x`, SECRET), null);
  assert.equal(await verifyFlowState(token, 'another-secret'), null);
});

test('an expired flow state is null', async () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const token = await new SignJWT({ use: 'oidc-flow', state: 's', nonce: 'n', cv: 'c' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('eunomia')
    .setIssuedAt(past - 600)
    .setExpirationTime(past)
    .sign(new TextEncoder().encode(SECRET));
  assert.equal(await verifyFlowState(token, SECRET), null);
});

test('an access token is not a flow state, and a flow state is not an access token', async () => {
  const access = await signAccessToken('a-user-uuid', SECRET, 900);
  assert.equal(await verifyFlowState(access, SECRET), null);

  const flow = await signFlowState(FLOW, SECRET);
  await assert.rejects(verifyAccessToken(flow, SECRET));

  // Even one that carries a subject: the `use` claim alone is refused.
  const withSubject = await new SignJWT({ use: 'oidc-flow' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('a-user-uuid')
    .setIssuer('eunomia')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
  await assert.rejects(verifyAccessToken(withSubject, SECRET));
});

test('the flow cookie is read from the cookie header', () => {
  assert.equal(readFlowCookie('refresh_token=r; oidc_flow=abc'), 'abc');
  assert.equal(readFlowCookie('refresh_token=r'), undefined);
  assert.equal(readFlowCookie(undefined), undefined);
});
