import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

test('GET /api/v1/version returns the version from package.json', async () => {
  const response = await request(createApp()).get('/api/v1/version');

  assert.equal(response.status, 200);
  assert.equal(response.body.version, packageJson.version);
});

test('GET /api/v1/version reports the environment', async () => {
  // Whatever NODE_ENV says, unset included; the browser title turns anything
  // other than 'production' into a marker (apps/web/src/lib/app-info.ts).
  const response = await request(createApp()).get('/api/v1/version');

  assert.equal(response.status, 200);
  assert.equal(response.body.environment, process.env.NODE_ENV ?? 'development');
});

test('the version endpoint works without a database (health check target)', async () => {
  // In production '/' serves the SPA; the container health check uses this
  // JSON endpoint instead, which needs no database.
  const response = await request(createApp()).get('/api/v1/version');

  assert.equal(response.status, 200);
});
