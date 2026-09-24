import { z } from 'zod';

import type { UpdateCheckConfig } from '../config/env.js';
import { isNewerVersion, parseVersion } from './semver.js';

/**
 * `ok` — we know the latest release. `disabled` — the operator turned the check
 * off. `unavailable` — we could not find out (offline, rate limited, or the
 * repository is private and no UPDATE_CHECK_TOKEN is configured). The UI shows
 * a notice only for `ok`, so an unreachable GitHub is silent rather than noisy.
 */
export type UpdateCheckStatus = 'ok' | 'disabled' | 'unavailable';

export interface UpdateStatus {
  /** The version this instance is running. */
  current: string;
  /** Latest released version, without the tag's `v` prefix. Null unless `status` is `ok`. */
  latest: string | null;
  updateAvailable: boolean;
  /** Link to the release notes, for the UI to point at. */
  releaseUrl: string | null;
  /** When the upstream answer this result is based on was fetched. */
  checkedAt: string | null;
  status: UpdateCheckStatus;
}

/** The fields we use from GitHub's release payload; everything else is dropped. */
const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string().url(),
  prerelease: z.boolean().default(false),
  draft: z.boolean().default(false),
});

/** A failed lookup is retried sooner than a successful one is refreshed. */
const FAILURE_CACHE_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export interface UpdateCheckerDeps {
  /** Injectable for tests, which must not reach the network. */
  fetch?: typeof globalThis.fetch;
  /** Injectable clock, so cache expiry is testable without waiting. */
  now?: () => number;
}

/**
 * Builds the update checker: an async function that answers "is there a newer
 * release?" and caches the answer.
 *
 * The cache lives in this closure rather than in a module-level variable, so
 * each app instance (and each test) gets its own. Concurrent callers share one
 * in-flight request — every page load asks this endpoint, and a homelab
 * instance must not turn that into a burst against api.github.com.
 */
export function createUpdateChecker(
  config: UpdateCheckConfig,
  currentVersion: string,
  deps: UpdateCheckerDeps = {},
): () => Promise<UpdateStatus> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;

  let cached: { result: UpdateStatus; expiresAt: number } | null = null;
  let inFlight: Promise<UpdateStatus> | null = null;

  function base(status: UpdateCheckStatus): UpdateStatus {
    return {
      current: currentVersion,
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: null,
      status,
    };
  }

  async function fetchLatestRelease(): Promise<UpdateStatus> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub rejects API requests without a User-Agent.
      'User-Agent': `eunomia/${currentVersion}`,
    };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;

    let response: Response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${config.repository}/releases/latest`,
        { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
    } catch (error) {
      console.warn('Update check failed to reach GitHub:', error);
      return base('unavailable');
    }

    if (!response.ok) {
      // 404 is the normal answer for a private repository without a token, so
      // none of this is an error — nothing here is broken.
      const hint =
        response.status === 404 && !config.token
          ? ' A private repository needs UPDATE_CHECK_TOKEN.'
          : '';
      console.warn(
        `Update check: GitHub answered ${response.status} for ${config.repository}.${hint}`,
      );
      return base('unavailable');
    }

    const parsed = releaseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn('Update check: unexpected release payload from GitHub.');
      return base('unavailable');
    }

    const release = parsed.data;
    // `releases/latest` never returns these, but the filter keeps the promise
    // ("a published, final release") even if the source ever changes.
    if (release.prerelease || release.draft) return base('unavailable');

    const latest = parseVersion(release.tag_name);
    if (!latest) {
      console.warn(`Update check: release tag is not a version: ${release.tag_name}`);
      return base('unavailable');
    }

    return {
      current: currentVersion,
      latest: `${latest.major}.${latest.minor}.${latest.patch}`,
      updateAvailable: isNewerVersion(release.tag_name, currentVersion),
      releaseUrl: release.html_url,
      checkedAt: new Date(now()).toISOString(),
      status: 'ok',
    };
  }

  return function checkForUpdate(): Promise<UpdateStatus> {
    if (!config.enabled) return Promise.resolve(base('disabled'));
    if (cached && cached.expiresAt > now()) return Promise.resolve(cached.result);

    inFlight ??= fetchLatestRelease()
      .then((result) => {
        const ttl = result.status === 'ok' ? config.cacheTtlMs : FAILURE_CACHE_MS;
        cached = { result, expiresAt: now() + ttl };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
