import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/auth';
import { apiData, apiFetch } from './api';
import { HttpError } from './http';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

// Only the call itself is replaced: `apiFetch` branches on `instanceof
// HttpError`, so the real class has to stay.
vi.mock('./http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./http')>()),
  request,
}));

const user = { uuid: 'u1', email: 'a@b.c', firstname: 'A', surname: null };

/** The token in each call, in the order the calls were made. */
function tokensUsed(): unknown[] {
  return request.mock.calls.map(([, options]) => options?.token);
}

function paths(): unknown[] {
  return request.mock.calls.map(([path]) => path);
}

describe('apiFetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('attaches the access token', async () => {
    request.mockResolvedValue({ data: [] });
    useAuthStore().accessToken = 'live';

    await apiFetch('/invoices');

    expect(request).toHaveBeenCalledWith('/invoices', { token: 'live' });
  });

  it('passes an error that is not a 401 straight through', async () => {
    request.mockRejectedValue(new HttpError(403, 'FORBIDDEN', 'nope'));
    useAuthStore().accessToken = 'live';

    await expect(apiFetch('/invoices')).rejects.toMatchObject({ status: 403 });
    expect(paths()).not.toContain('/auth/refresh');
  });

  it('refreshes once and retries when the token has expired', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'expired';
    request.mockImplementation(async (path: string, options?: { token?: string | null }) => {
      if (path === '/auth/refresh') return { accessToken: 'fresh', user };
      if (options?.token === 'fresh') return { data: path };
      throw new HttpError(401, 'TOKEN_EXPIRED', 'expired');
    });

    await expect(apiFetch('/invoices')).resolves.toEqual({ data: '/invoices' });

    expect(paths()).toEqual(['/invoices', '/auth/refresh', '/invoices']);
    expect(auth.accessToken).toBe('fresh');
  });

  /**
   * The bug this slice exists for (issues.md 0.16.0-slice.2 24): two lists
   * loading at once after a 15-minute pause. Without a shared refresh the
   * second exchange presents a token the first one had just revoked, fails, and
   * clears the session that was working — the user lands on the login page.
   */
  it('keeps the session when two requests run into the expired token together', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'expired';
    auth.user = user;
    let rotations = 0;
    request.mockImplementation(async (path: string, options?: { token?: string | null }) => {
      if (path === '/auth/refresh') {
        rotations += 1;
        // The server revokes what it rotated away: a second exchange of the
        // same cookie would be refused.
        if (rotations > 1) throw new HttpError(401, 'TOKEN_REVOKED', 'revoked');
        return { accessToken: 'fresh', user };
      }
      if (options?.token === 'fresh') return { data: path };
      throw new HttpError(401, 'TOKEN_EXPIRED', 'expired');
    });

    const both = await Promise.all([apiFetch('/invoices'), apiFetch('/accounts')]);

    expect(both).toEqual([{ data: '/invoices' }, { data: '/accounts' }]);
    expect(rotations).toBe(1);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).toEqual(user);
  });

  it('repeats a late 401 with the token a sibling fetched, without exchanging again', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'expired';
    // The 401 arrives after another request has already renewed the token, so
    // the shared exchange is over and there is nothing left to refresh.
    request.mockImplementationOnce(async () => {
      auth.accessToken = 'fresh';
      throw new HttpError(401, 'TOKEN_EXPIRED', 'expired');
    });
    request.mockImplementationOnce(async () => ({ data: 'ok' }));

    await expect(apiFetch('/invoices')).resolves.toEqual({ data: 'ok' });

    expect(paths()).toEqual(['/invoices', '/invoices']);
    expect(tokensUsed()).toEqual(['expired', 'fresh']);
  });

  it('ends the session and reports the original error when the refresh fails', async () => {
    const auth = useAuthStore();
    auth.accessToken = 'expired';
    auth.user = user;
    request.mockImplementation(async (path: string) => {
      if (path === '/auth/refresh') throw new HttpError(401, 'NO_SESSION', 'no cookie');
      throw new HttpError(401, 'TOKEN_EXPIRED', 'expired');
    });

    // The router guard reads the status, so the request's error is what has to
    // surface — not the refresh's.
    await expect(apiFetch('/invoices')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
    expect(auth.isAuthenticated).toBe(false);
  });
});

describe('apiData', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('answers with the payload instead of the envelope', async () => {
    request.mockResolvedValue({ data: [{ accountUID: 'a1' }] });

    await expect(apiData('/accounts')).resolves.toEqual([{ accountUID: 'a1' }]);
  });

  it('forwards method and body', async () => {
    request.mockResolvedValue({ data: { invoiceUID: 'i1' } });

    await apiData('/invoices', { method: 'POST', body: { amount: 1 } });

    expect(request).toHaveBeenCalledWith('/invoices', {
      method: 'POST',
      body: { amount: 1 },
      token: null,
    });
  });
});
