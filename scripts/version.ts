/**
 * Moves Eunomia's version number, the way Notes/eunomia-plan.md §2.9 defines it:
 * a minor per finished feature, a patch only for a hotfix on a released minor,
 * and every slice on the way to the next feature as a `-slice.N` pre-release.
 *
 * Why a script: the version lives in four package.json files plus five places in
 * package-lock.json, and the running app reports the one from apps/api
 * (lib/app-version.ts). A tag whose number does not match that file would make
 * the update check lie about what is installed — so bumps go through `set`/`next`
 * and `check` guards the rest (it runs in CI and again before a release).
 *
 * Usage:
 *   node scripts/version.ts set <version> [--force]
 *   node scripts/version.ts next slice|minor|patch|major [--force]
 *   node scripts/version.ts check [--tag <vX.Y.Z>]
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { compareVersions, parseVersion, type ParsedVersion } from '../apps/api/src/lib/semver.ts';
import { readChangelogSection } from './changelog.ts';

/** Every workspace that carries the version; `''` is the repo root. */
const WORKSPACES = ['', 'apps/api', 'apps/web', 'packages/shared-types'];

/** The pre-release identifier that marks a slice preview (§2.9). */
const SLICE_ID = 'slice';

type Json = Record<string, unknown>;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function packageJsonPath(workspace: string): string {
  return workspace === '' ? 'package.json' : `${workspace}/package.json`;
}

function fileUrl(relativePath: string): URL {
  return new URL(`../${relativePath}`, import.meta.url);
}

function readJson(relativePath: string): Json {
  return JSON.parse(readFileSync(fileUrl(relativePath), 'utf8')) as Json;
}

/**
 * Writes JSON back the way npm and Prettier both leave it: two-space indent and
 * a closing newline. Verified to round-trip package-lock.json byte for byte, so
 * a bump shows up as five changed lines instead of a reformatted lockfile.
 */
function writeJson(relativePath: string, value: Json): void {
  writeFileSync(fileUrl(relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function currentVersion(): string {
  const version = readJson('package.json').version;
  if (typeof version !== 'string') fail('The root package.json has no version.');
  return version;
}

/** Parses a version or aborts — the callers here cannot do anything useful with garbage. */
function parseOrFail(value: string, what: string): ParsedVersion {
  const parsed = parseVersion(value);
  if (!parsed) fail(`${what} is not a version: ${value}`);
  return parsed;
}

/** `0.10.0-slice.3` -> 3, for anything that is not a slice pre-release -> null. */
function sliceNumber(prerelease: string[]): number | null {
  if (prerelease.length !== 2 || prerelease[0] !== SLICE_ID) return null;
  const counter = Number(prerelease[1]);
  return Number.isInteger(counter) && counter > 0 ? counter : null;
}

function nextVersion(step: string, from: string): string {
  const { major, minor, patch, prerelease } = parseOrFail(from, 'The current version');
  const isFinal = prerelease.length === 0;

  switch (step) {
    case 'slice': {
      if (isFinal) return `${major}.${minor + 1}.0-${SLICE_ID}.1`;
      const counter = sliceNumber(prerelease);
      if (counter === null) {
        fail(`Cannot count on from the pre-release ${from}; set the next version explicitly.`);
      }
      return `${major}.${minor}.${patch}-${SLICE_ID}.${counter + 1}`;
    }
    case 'minor':
      // Finishing a feature drops the pre-release the slices were counting in.
      return isFinal ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch}`;
    case 'patch':
      if (!isFinal) {
        fail(
          `A patch is a hotfix on a released version, but ${from} is a pre-release. ` +
            `Finish it with \`next minor\` first.`,
        );
      }
      return `${major}.${minor}.${patch + 1}`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      return fail(`Unknown step: ${step}. Use slice, minor, patch or major.`);
  }
}

function setVersion(version: string, force: boolean): void {
  parseOrFail(version, 'The target version');

  const current = currentVersion();
  if (!force && compareVersions(version, current) <= 0) {
    fail(`${version} is not newer than the current ${current}. Use --force if that is on purpose.`);
  }

  for (const workspace of WORKSPACES) {
    const path = packageJsonPath(workspace);
    writeJson(path, { ...readJson(path), version });
  }

  // The lockfile repeats the version once at the top and once per workspace entry.
  const lockfile = readJson('package-lock.json');
  lockfile.version = version;
  const packages = lockfile.packages as Record<string, Json> | undefined;
  for (const workspace of WORKSPACES) {
    const entry = packages?.[workspace];
    if (!entry) fail(`package-lock.json has no entry for "${workspace}" — run npm install.`);
    entry.version = version;
  }
  writeJson('package-lock.json', lockfile);

  console.log(`${current} -> ${version}`);
  if (!readChangelogSection(version)) {
    console.log(`Next: add a "## ${version}" section to CHANGELOG.md (version:check wants it).`);
  }
  console.log(
    `After committing: git tag -a v${version} -m "v${version}" && git push --follow-tags`,
  );
}

function check(tag: string | null): void {
  const version = currentVersion();
  const problems: string[] = [];

  for (const workspace of WORKSPACES.slice(1)) {
    const path = packageJsonPath(workspace);
    const found = readJson(path).version;
    if (found !== version)
      problems.push(`${path} says ${String(found)}, package.json says ${version}`);
  }

  const lockfile = readJson('package-lock.json');
  if (lockfile.version !== version) {
    problems.push(
      `package-lock.json says ${String(lockfile.version)}, package.json says ${version}`,
    );
  }
  const packages = lockfile.packages as Record<string, Json> | undefined;
  for (const workspace of WORKSPACES) {
    const found = packages?.[workspace]?.version;
    if (found !== version) {
      problems.push(
        `package-lock.json entry "${workspace}" says ${String(found)}, package.json says ${version}`,
      );
    }
  }

  if (!readChangelogSection(version)) {
    problems.push(`CHANGELOG.md has no "## ${version}" section`);
  }

  if (tag !== null) {
    const tagged = tag.replace(/^v/, '');
    if (tagged !== version) problems.push(`tag ${tag} does not match the version ${version}`);
  }

  if (problems.length > 0) {
    fail(`Version metadata is inconsistent:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  }

  console.log(
    `Version ${version} is consistent across the workspaces, the lockfile and CHANGELOG.md.`,
  );
}

function main(argv: string[]): void {
  const args = argv.filter((argument) => argument !== '--force');
  const force = argv.includes('--force');
  const [command, value] = args;

  switch (command) {
    case 'set':
      if (!value) fail('Usage: node scripts/version.ts set <version> [--force]');
      setVersion(value, force);
      break;
    case 'next':
      if (!value) fail('Usage: node scripts/version.ts next slice|minor|patch|major [--force]');
      setVersion(nextVersion(value, currentVersion()), force);
      break;
    case 'check': {
      const tagIndex = args.indexOf('--tag');
      const tag = tagIndex === -1 ? null : args[tagIndex + 1];
      if (tagIndex !== -1 && !tag) fail('--tag needs a value, e.g. --tag v0.10.0');
      check(tag ?? null);
      break;
    }
    default:
      fail('Usage: node scripts/version.ts set|next|check … (see the comment at the top)');
  }
}

main(process.argv.slice(2));
