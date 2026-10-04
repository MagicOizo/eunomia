import { isHttpUrl } from '@eunomia/shared';
import { z } from 'zod';

import type { UpdateCheckConfig } from '../config/env.js';
import { logEvent } from './log.js';
import { isNewerVersion, parseVersion } from './semver.js';

/**
 * `ok` — we know the latest release. `disabled` — the operator turned the check
 * off. `unavailable` — we could not find out (offline, rate limited, or the
 * repository is private and no token is configured). The footer shows a notice
 * only for `ok`, so an unreachable GitHub is silent rather than noisy — but the
 * settings page shows `reason`, because there "silent" reads like a bug.
 */
export type UpdateCheckStatus = 'ok' | 'disabled' | 'unavailable';

/** Why the latest release is unknown. Set whenever `status` is `unavailable`. */
export type UpdateUnavailableReason =
  /** 404 without a token: exactly what a private repository answers. */
  | 'no_token_private'
  /** 404 although a token was sent, or any other unexpected status. */
  | 'not_found'
  | 'network'
  | 'rate_limited'
  | 'unauthorized'
  /** The answer arrived but was not a usable final release. */
  | 'no_release';

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
  /** Only set for `unavailable`, so the settings page can name the cause. */
  reason?: UpdateUnavailableReason;
}

/**
 * The fields we use from GitHub's release payload; everything else is dropped.
 *
 * `html_url` ends up in an `href` in the footer and on the settings page, so it
 * passes the same `isHttpUrl` the invoice link does: `.url()` alone accepts
 * `javascript:`, which is the whole point of SEC-01 and of I-9. The answer
 * comes from api.github.com over TLS, so this is a wall, not a patch — but the
 * rule says the scheme is checked where the URL enters, not where it is
 * trusted.
 */
const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string().url().refine(isHttpUrl),
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
  /**
   * Resolves the token per check instead of capturing it once, so a token
   * stored in the system settings takes effect without a restart. Falls back to
   * the `.env` value (UPDATE_CHECK_TOKEN) when it returns undefined.
   */
  resolveToken?: () => Promise<string | undefined>;
}

/** Options for a single check. */
export interface CheckOptions {
  /**
   * Ignore the cached answer and ask GitHub now — what the "check now" button in
   * the system settings does. Without it an admin who has just entered a token
   * would keep seeing the cached failure for up to 15 minutes.
   */
  force?: boolean;
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
): (options?: CheckOptions) => Promise<UpdateStatus> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;

  let cached: { result: UpdateStatus; expiresAt: number } | null = null;
  let inFlight: Promise<UpdateStatus> | null = null;

  function base(status: UpdateCheckStatus, reason?: UpdateUnavailableReason): UpdateStatus {
    return {
      current: currentVersion,
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: null,
      status,
      ...(reason === undefined ? {} : { reason }),
    };
  }

  /** The stored token wins over the environment, so it can be rotated in the UI. */
  async function currentToken(): Promise<string | undefined> {
    return (await deps.resolveToken?.()) ?? config.token;
  }

  async function fetchLatestRelease(): Promise<UpdateStatus> {
    const token = await currentToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub rejects API requests without a User-Agent.
      'User-Agent': `eunomia/${currentVersion}`,
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${config.repository}/releases/latest`,
        { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
    } catch (error) {
      logEvent('warn', 'UPDATE_CHECK_UNAVAILABLE', {
        reason: 'network',
        repository: config.repository,
        message: error instanceof Error ? error.message : String(error),
      });
      return base('unavailable', 'network');
    }

    if (!response.ok) {
      // 404 is the normal answer for a private repository without a token, so
      // none of this is an error — nothing here is broken.
      const reason: UpdateUnavailableReason =
        response.status === 404
          ? token
            ? 'not_found'
            : 'no_token_private'
          : response.status === 401 || response.status === 403
            ? // 403 is what GitHub uses for a spent rate limit as well as for a
              // rejected token; the remaining-requests header tells them apart.
              response.headers.get('x-ratelimit-remaining') === '0'
              ? 'rate_limited'
              : 'unauthorized'
            : 'network';
      logEvent('warn', 'UPDATE_CHECK_UNAVAILABLE', {
        reason,
        repository: config.repository,
        status: response.status,
      });
      return base('unavailable', reason);
    }

    const parsed = releaseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logEvent('warn', 'UPDATE_CHECK_UNAVAILABLE', {
        reason: 'no_release',
        repository: config.repository,
        message: 'unexpected release payload',
      });
      return base('unavailable', 'no_release');
    }

    const release = parsed.data;
    // `releases/latest` never returns these, but the filter keeps the promise
    // ("a published, final release") even if the source ever changes.
    if (release.prerelease || release.draft) return base('unavailable', 'no_release');

    const latest = parseVersion(release.tag_name);
    if (!latest) {
      logEvent('warn', 'UPDATE_CHECK_UNAVAILABLE', {
        reason: 'no_release',
        repository: config.repository,
        tag: release.tag_name,
      });
      return base('unavailable', 'no_release');
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

  return function checkForUpdate(options: CheckOptions = {}): Promise<UpdateStatus> {
    if (!config.enabled) return Promise.resolve(base('disabled'));
    if (!options.force && cached && cached.expiresAt > now()) {
      return Promise.resolve(cached.result);
    }

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
