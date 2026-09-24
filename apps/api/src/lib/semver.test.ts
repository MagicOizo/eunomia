import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions, isNewerVersion, parseVersion } from './semver.js';

test('parseVersion accepts release tags with and without the v prefix', () => {
  assert.deepEqual(parseVersion('v0.9.0'), { major: 0, minor: 9, patch: 0, prerelease: [] });
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parseVersion('1.0.0-rc.1'), {
    major: 1,
    minor: 0,
    patch: 0,
    prerelease: ['rc', '1'],
  });
  // Build metadata is accepted but carries no ordering information.
  assert.deepEqual(parseVersion('1.0.0+20260924'), {
    major: 1,
    minor: 0,
    patch: 0,
    prerelease: [],
  });
});

test('parseVersion rejects anything that is not a version', () => {
  for (const value of ['', 'latest', '1.2', 'v1.2.3.4', '1.2.x', 'release-1.2.3']) {
    assert.equal(parseVersion(value), null, value);
  }
});

test('compareVersions orders by major, then minor, then patch', () => {
  assert.ok(compareVersions('1.0.0', '0.9.0') > 0);
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0);
  assert.ok(compareVersions('0.9.1', '0.9.0') > 0);
  assert.equal(compareVersions('v0.9.0', '0.9.0'), 0);
});

test('a pre-release ranks below the same version without one', () => {
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0-rc.2') < 0);
  // Numeric identifiers compare numerically, not as text (semver.org #11).
  assert.ok(compareVersions('1.0.0-rc.9', '1.0.0-rc.10') < 0);
  // A longer identifier list wins when the shorter one is a prefix of it.
  assert.ok(compareVersions('1.0.0-rc', '1.0.0-rc.1') < 0);
  // Alphanumeric identifiers rank above numeric ones.
  assert.ok(compareVersions('1.0.0-1', '1.0.0-alpha') < 0);
});

test('compareVersions throws on input it cannot order', () => {
  assert.throws(() => compareVersions('1.0.0', 'latest'), /Cannot compare versions/);
});

test('isNewerVersion is strict and treats unusable input as "no update"', () => {
  assert.equal(isNewerVersion('1.0.0', '0.9.0'), true);
  assert.equal(isNewerVersion('0.9.0', '0.9.0'), false);
  assert.equal(isNewerVersion('0.8.0', '0.9.0'), false);
  // Never nag because a tag upstream was malformed.
  assert.equal(isNewerVersion('nightly', '0.9.0'), false);
  assert.equal(isNewerVersion('1.0.0', 'unknown'), false);
});
