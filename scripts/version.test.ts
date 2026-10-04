/**
 * The version check, which until now had no test at all — while three tag
 * pushes went red in the Actions because nothing judged the tag before it was
 * pushed (issues.md 0.18.0-1).
 *
 * Two halves. The comparison runs against an in-memory set of files, so every
 * kind of drift can be shown without a repository. The reading from a commit
 * runs against a repository built here with two commits, because that is the
 * part that has to be true: `--at v0.19.0` must judge the files of *that*
 * commit, not the ones lying in the working tree.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { committed, type RepoFiles } from './repo-files.ts';
import { check } from './version.ts';

const WORKSPACES = ['', 'apps/api', 'apps/web', 'packages/shared'];

/** Every file the check reads, all agreeing on one version. */
function repoAt(version: string): Record<string, string> {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ version }),
    'package-lock.json': JSON.stringify({
      version,
      packages: Object.fromEntries(WORKSPACES.map((workspace) => [workspace, { version }])),
    }),
    'CHANGELOG.md': `# Changelog\n\n## ${version} — 2026-10-04\n\n- A line.\n`,
  };
  for (const workspace of WORKSPACES.slice(1)) {
    files[`${workspace}/package.json`] = JSON.stringify({ version });
  }
  return files;
}

/** Reads from a plain map, the way `workingTree` reads from disk. */
function filesOf(contents: Record<string, string>): RepoFiles {
  return (relativePath) => {
    const found = contents[relativePath];
    if (found === undefined) throw new Error(`no ${relativePath}`);
    return found;
  };
}

describe('check', () => {
  test('passes when every file agrees and the changelog has the section', () => {
    assert.match(check(null, filesOf(repoAt('0.19.0'))), /0\.19\.0 is consistent/);
  });

  test('passes when the tag names exactly that version', () => {
    assert.match(check('v0.19.0', filesOf(repoAt('0.19.0'))), /consistent/);
  });

  test('rejects a tag that does not match the version', () => {
    assert.throws(
      () => check('v0.19.0', filesOf(repoAt('0.19.0-slice.6'))),
      /tag v0\.19\.0 does not match the version 0\.19\.0-slice\.6/,
    );
  });

  test('rejects a workspace left behind', () => {
    const files = repoAt('0.19.0');
    files['apps/web/package.json'] = JSON.stringify({ version: '0.18.0' });
    assert.throws(() => check(null, filesOf(files)), /apps\/web\/package\.json says 0\.18\.0/);
  });

  test('rejects a lockfile entry left behind', () => {
    const files = repoAt('0.19.0');
    const lockfile = JSON.parse(files['package-lock.json'] ?? '{}') as {
      packages: Record<string, { version: string }>;
    };
    lockfile.packages['packages/shared'] = { version: '0.18.0' };
    files['package-lock.json'] = JSON.stringify(lockfile);
    assert.throws(() => check(null, filesOf(files)), /entry "packages\/shared" says 0\.18\.0/);
  });

  test('rejects a version the changelog does not document', () => {
    const files = repoAt('0.19.0');
    files['CHANGELOG.md'] = '# Changelog\n\n## 0.18.0 — 2026-10-03\n\n- Older.\n';
    assert.throws(() => check(null, filesOf(files)), /no "## 0\.19\.0" section/);
  });
});

describe('committed', () => {
  let root = '';

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'eunomia-version-'));
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');

    // Two commits, each a consistent repo at its own version, with the tag on
    // the older one. HEAD is then what a working tree would show.
    for (const [index, version] of ['0.18.0', '0.19.0'].entries()) {
      for (const [path, body] of Object.entries(repoAt(version))) {
        mkdirSync(join(root, dirname(path)), { recursive: true });
        writeFileSync(join(root, path), body);
      }
      git('add', '-A');
      git('commit', '-q', '-m', version);
      if (index === 0) git('tag', `v${version}`);
    }
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test('reads the tagged commit, not the working tree', () => {
    // The tag sits on 0.18.0 while HEAD is at 0.19.0. Judged against the commit
    // the tag names, v0.18.0 is right — and that is the whole point of `--at`:
    // without it the same tag is measured against the newer tree and the check
    // would pass or fail for the wrong reason.
    assert.match(check('v0.18.0', committed('v0.18.0', root)), /0\.18\.0 is consistent/);
    assert.throws(
      () => check('v0.18.0', committed('HEAD', root)),
      /tag v0\.18\.0 does not match the version 0\.19\.0/,
    );
  });

  test('says which file it could not read and where', () => {
    assert.throws(
      () => committed('HEAD', root)('nope.json'),
      /Cannot read nope\.json at HEAD — unknown commit or path/,
    );
    assert.throws(
      () => committed('no-such-ref', root)('package.json'),
      /Cannot read package\.json at no-such-ref/,
    );
  });
});
