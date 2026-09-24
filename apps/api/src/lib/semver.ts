/**
 * Just enough semantic versioning to answer one question: is the version out
 * there newer than the one running here? A dependency for that would be a
 * dependency to audit and update forever, so the handful of rules from
 * semver.org that we actually rely on live here instead.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated pre-release identifiers, empty for a final release. */
  prerelease: string[];
}

/** Matches `1.2.3`, `v1.2.3`, `1.2.3-rc.1`, `1.2.3+build` (build metadata is ignored). */
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parses a version (with or without a leading `v`), or null if it is not one. */
export function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  };
}

/** Compares one pre-release identifier: numeric ones sort below alphanumeric ones. */
function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compares pre-release identifier lists; a shorter prefix sorts lower (1.0.0-rc < 1.0.0-rc.1). */
function comparePrerelease(a: string[], b: string[]): number {
  // A version WITH a pre-release ranks below the same version without one.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const result = compareIdentifiers(a[index] ?? '', b[index] ?? '');
    if (result !== 0) return result;
  }
  return a.length - b.length;
}

/**
 * Orders two versions: negative when `a` is older, positive when newer, 0 when
 * equal. Throws on unparseable input — callers that cannot tolerate that should
 * use `isNewerVersion`, which treats garbage as "no update".
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    throw new Error(`Cannot compare versions: ${JSON.stringify([a, b])}`);
  }

  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * True when `candidate` is strictly newer than `current`. Unparseable input
 * yields false on purpose: an update notice is only worth showing when we are
 * sure, and a malformed tag upstream must never nag every user of this instance.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  if (!parseVersion(candidate) || !parseVersion(current)) return false;
  return compareVersions(candidate, current) > 0;
}
