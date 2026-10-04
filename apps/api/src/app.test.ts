import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from './app.js';

/**
 * The headers are the one thing in this project that protects a browser rather
 * than the data, and nothing in the app notices when they go missing: the API
 * answers exactly the same without them. So they get a test of their own
 * (Sicherheits-Review, SEC-02). createApp() without dependencies is enough —
 * the headers are mounted before anything that needs a database.
 */

/** Parses a CSP header into directive -> value list. */
function directives(header: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};
  for (const part of header.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) parsed[name] = values;
  }
  return parsed;
}

test('every answer carries a Content-Security-Policy', async () => {
  const response = await request(createApp()).get('/api/v1/version');

  const csp = response.headers['content-security-policy'];
  assert.ok(csp, 'no Content-Security-Policy header');

  const policy = directives(csp);
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  // The two named relaxations: the GiroCode data URL and Vue's inline styles.
  assert.deepEqual(policy['img-src'], ["'self'", 'data:']);
  assert.deepEqual(policy['style-src'], ["'self'", "'unsafe-inline'"]);
  // Scripts, however, stay without 'unsafe-inline' and without 'unsafe-eval'.
  assert.ok(!csp.includes("'unsafe-eval'"), `CSP allows eval: ${csp}`);
});

test('the policy does not upgrade this origin to https', async () => {
  // The documented deployment answers over plain http behind a proxy;
  // upgrade-insecure-requests would send its own assets to an https port
  // where nothing listens. helmet's defaults include it, so this is a guard
  // against taking the defaults by accident.
  const response = await request(createApp()).get('/api/v1/version');

  const csp = response.headers['content-security-policy'] ?? '';
  assert.ok(!csp.includes('upgrade-insecure-requests'), csp);
});

test('a 404 is served with the headers too', async () => {
  // Not an endpoint, hence no SPA fallback either (no webRoot here).
  const response = await request(createApp()).get('/api/v1/does-not-exist');

  assert.equal(response.status, 404);
  assert.ok(response.headers['content-security-policy']);
});

test('the remaining security headers are set', async () => {
  const response = await request(createApp()).get('/api/v1/version');

  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.match(response.headers['strict-transport-security'] ?? '', /^max-age=15552000/);
});

test('the server does not name itself', async () => {
  const response = await request(createApp()).get('/api/v1/version');

  assert.equal(response.headers['x-powered-by'], undefined);
});
