import assert from 'node:assert/strict';
import test from 'node:test';

import type { UpdateCheckConfig } from '../config/env.js';
import { createUpdateChecker } from './update-check.js';

const config: UpdateCheckConfig = {
  enabled: true,
  repository: 'MagicOizo/eunomia',
  token: undefined,
  cacheTtlMs: 6 * 60 * 60 * 1000,
};

/** A release payload as GitHub returns it, trimmed to the fields we read. */
function releaseResponse(tag: string, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      tag_name: tag,
      html_url: `https://github.com/MagicOizo/eunomia/releases/tag/${tag}`,
      prerelease: false,
      draft: false,
      ...extra,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
}

/** Records every call so tests can assert on caching and on the headers sent. */
function stubFetch(responder: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return responder();
  };
  /** The call under test, failing loudly instead of returning `undefined`. */
  const call = (index: number): RecordedCall => {
    const recorded = calls[index];
    assert.ok(recorded, `expected at least ${index + 1} fetch call(s)`);
    return recorded;
  };
  return { fetchImpl, calls, call };
}

test('reports an available update when the latest release is newer', async () => {
  const { fetchImpl, call } = stubFetch(() => releaseResponse('v1.0.0'));
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  const result = await check();

  assert.equal(result.status, 'ok');
  assert.equal(result.current, '0.9.0');
  assert.equal(result.latest, '1.0.0');
  assert.equal(result.updateAvailable, true);
  assert.equal(result.releaseUrl, 'https://github.com/MagicOizo/eunomia/releases/tag/v1.0.0');
  assert.equal(call(0).url, 'https://api.github.com/repos/MagicOizo/eunomia/releases/latest');
  assert.equal(call(0).headers.Accept, 'application/vnd.github+json');
  assert.equal(call(0).headers['User-Agent'], 'eunomia/0.9.0');
  assert.equal(call(0).headers.Authorization, undefined);
});

test('reports no update when the running version is the latest release', async () => {
  const { fetchImpl } = stubFetch(() => releaseResponse('v0.9.0'));
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  const result = await check();

  assert.equal(result.status, 'ok');
  assert.equal(result.latest, '0.9.0');
  assert.equal(result.updateAvailable, false);
});

test('a running version ahead of the release (dev build) is not an update', async () => {
  const { fetchImpl } = stubFetch(() => releaseResponse('v0.9.0'));
  const check = createUpdateChecker(config, '1.0.0', { fetch: fetchImpl });

  assert.equal((await check()).updateAvailable, false);
});

test('sends the token as a bearer header when one is configured', async () => {
  const { fetchImpl, call } = stubFetch(() => releaseResponse('v1.0.0'));
  const check = createUpdateChecker({ ...config, token: 'ghp_secret' }, '0.9.0', {
    fetch: fetchImpl,
  });

  await check();

  assert.equal(call(0).headers.Authorization, 'Bearer ghp_secret');
});

test('disabled by configuration means no request at all', async () => {
  const { fetchImpl, calls } = stubFetch(() => releaseResponse('v1.0.0'));
  const check = createUpdateChecker({ ...config, enabled: false }, '0.9.0', { fetch: fetchImpl });

  const result = await check();

  assert.equal(result.status, 'disabled');
  assert.equal(result.updateAvailable, false);
  assert.equal(calls.length, 0);
});

test('a 404 without a token (wrong or private repository) is unavailable, not an error', async () => {
  const { fetchImpl } = stubFetch(() => new Response('{"message":"Not Found"}', { status: 404 }));
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  const result = await check();

  assert.equal(result.status, 'unavailable');
  assert.equal(result.latest, null);
  assert.equal(result.updateAvailable, false);
});

test('a network failure is unavailable, not a rejected promise', async () => {
  const { fetchImpl } = stubFetch(() => {
    throw new Error('getaddrinfo ENOTFOUND api.github.com');
  });
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  assert.equal((await check()).status, 'unavailable');
});

test('a pre-release or draft is not offered as an update', async () => {
  for (const extra of [{ prerelease: true }, { draft: true }]) {
    const { fetchImpl } = stubFetch(() => releaseResponse('v1.0.0', extra));
    const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

    assert.equal((await check()).status, 'unavailable', JSON.stringify(extra));
  }
});

test('a tag that is not a version is ignored', async () => {
  const { fetchImpl } = stubFetch(() => releaseResponse('nightly'));
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  assert.equal((await check()).status, 'unavailable');
});

test('an unexpected payload shape is ignored', async () => {
  const { fetchImpl } = stubFetch(() => new Response('{"unexpected":true}', { status: 200 }));
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  assert.equal((await check()).status, 'unavailable');
});

test('I-9: a release URL that is not http(s) is ignored, not handed to the footer', async () => {
  const { fetchImpl } = stubFetch(() =>
    releaseResponse('v1.0.0', { html_url: 'javascript:alert(document.domain)' }),
  );
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  const result = await check();

  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'no_release');
  assert.equal(result.releaseUrl, null);
});

test('a successful answer is cached until the TTL expires', async () => {
  const { fetchImpl, calls } = stubFetch(() => releaseResponse('v1.0.0'));
  let clock = 1_000_000;
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl, now: () => clock });

  await check();
  await check();
  assert.equal(calls.length, 1, 'second call within the TTL must reuse the cache');

  clock += config.cacheTtlMs + 1;
  await check();
  assert.equal(calls.length, 2, 'after the TTL GitHub is asked again');
});

test('a failure is retried sooner than a success is refreshed', async () => {
  const { fetchImpl, calls } = stubFetch(() => new Response('', { status: 500 }));
  let clock = 1_000_000;
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl, now: () => clock });

  await check();
  clock += 16 * 60 * 1000; // past the 15-minute failure window, far short of the 6-hour TTL
  await check();

  assert.equal(calls.length, 2);
});

test('concurrent callers share a single request', async () => {
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const { fetchImpl, calls } = stubFetch(() => pending);
  const check = createUpdateChecker(config, '0.9.0', { fetch: fetchImpl });

  const both = Promise.all([check(), check()]);
  release(releaseResponse('v1.0.0'));
  const [first, second] = await both;

  assert.equal(calls.length, 1);
  assert.equal(first.updateAvailable, true);
  assert.deepEqual(first, second);
});
