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

test('GET / responds with 200', async () => {
  const response = await request(createApp()).get('/');

  assert.equal(response.status, 200);
});
