import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

/**
 * I-13 as a check instead of a promise: the development seed must refuse
 * `NODE_ENV=production`, so the demo password cannot land in a real instance.
 *
 * The guard sits in `main()`, which only runs when the file is the entry
 * point — so this spawns it the way `npm run seed` does. The environment is
 * built from scratch rather than inherited: a run with no `DB_*` variables
 * cannot reach a database at all, which is what makes it safe to assert that
 * the refusal comes *before* anything is opened.
 *
 * The assertion is on the message, not on the exit code. Without the guard the
 * seed would fail on the missing `DB_HOST` and exit non-zero just the same —
 * a check on the code alone would be green with the rule gone.
 */
test('I-13: the development seed refuses NODE_ENV=production', () => {
  const seed = resolve(process.cwd(), 'src/seed/seed.ts');

  const run = spawnSync(process.execPath, ['--import', 'tsx', seed], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' },
    encoding: 'utf8',
  });

  assert.notEqual(run.status, 0, 'the seed must not exit cleanly in production');
  assert.match(run.stderr, /Refusing to run the development seed against NODE_ENV=production/);
});
