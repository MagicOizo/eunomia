import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from './env.js';

/** Runs `run` with the given variables set (undefined = unset), restoring the rest afterwards. */
function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const saved = new Map(Object.keys(vars).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const REQUIRED = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-please-ignore',
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'n',
  CONFIG_ENCRYPTION_KEY: undefined,
};

test('PASSWORD_LOGIN_FORCE is off unless set (Slice 90)', () => {
  for (const value of [undefined, '', 'false', '0']) {
    const config = withEnv({ ...REQUIRED, PASSWORD_LOGIN_FORCE: value }, loadConfig);
    assert.equal(config.auth.passwordLoginForce, false, `for ${String(value)}`);
  }
});

test('PASSWORD_LOGIN_FORCE=true or 1 opens the way out', () => {
  for (const value of ['true', '1', ' TRUE ']) {
    const config = withEnv({ ...REQUIRED, PASSWORD_LOGIN_FORCE: value }, loadConfig);
    assert.equal(config.auth.passwordLoginForce, true, `for ${value}`);
  }
});

test('a malformed PASSWORD_LOGIN_FORCE stops the start', () => {
  assert.throws(
    () => withEnv({ ...REQUIRED, PASSWORD_LOGIN_FORCE: 'yes' }, loadConfig),
    /PASSWORD_LOGIN_FORCE must be true or false/,
  );
});
