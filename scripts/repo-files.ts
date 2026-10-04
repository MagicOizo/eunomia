/**
 * Where a script reads the repository's files from: the working tree, or the
 * tree of one commit.
 *
 * Why the distinction matters: a tag names a commit, not the working tree. The
 * version check is only honest about `v0.19.0` if it reads the package.json of
 * the commit that tag points at — three tag pushes went red in the Actions
 * because the bump was missing from the tagged commit while the working tree
 * had it (issues.md 0.18.0-1, §2.9 of the plan).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Reads one repo-relative path as UTF-8, or throws if it is not there. */
export type RepoFiles = (relativePath: string) => string;

/** The repository root, so `git` runs there and not in whatever cwd was used. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The files as they are on disk right now. */
export const workingTree: RepoFiles = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

/**
 * The files as one commit, tag or any other commit-ish holds them. `root` is
 * which repository to ask — this one unless a caller says otherwise, which is
 * what makes the mechanism testable against a repository built for the test.
 *
 * The buffer is set out loud: CHANGELOG.md and package-lock.json both grow, and
 * a reader that fails on size should say so rather than hand back half a file.
 */
export function committed(commitish: string, root: string = ROOT): RepoFiles {
  return (relativePath) => {
    try {
      return execFileSync('git', ['show', `${commitish}:${relativePath}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error(`Cannot read ${relativePath} at ${commitish} — unknown commit or path.`);
    }
  };
}
