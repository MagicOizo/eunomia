import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http')>()),
  request,
}));

const session = {
  accessToken: 'fresh',
  user: { uuid: 'u1', email: 'a@b.c', firstname: 'A', surname: null },
};

function refreshCalls(): number {
  return request.mock.calls.filter(([path]) => path === '/auth/refresh').length;
}

describe('auth store', () => {
  beforeEach(() => {
    // A fresh pinia per case: the shared refresh lives in the store's closure.
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('exchanges the cookie for a token', async () => {
    request.mockResolvedValue(session);
    const auth = useAuthStore();

    await expect(auth.tryRefresh()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith('/auth/refresh', { method: 'POST' });
    expect(auth.accessToken).toBe('fresh');
  });

  it('shares one exchange between callers that find the token expired together', async () => {
    request.mockResolvedValue(session);
    const auth = useAuthStore();

    const results = await Promise.all([auth.tryRefresh(), auth.tryRefresh(), auth.tryRefresh()]);

    // The point of the whole slice: the server rotates on every refresh, so a
    // second exchange would revoke the token the first one just handed out.
    expect(refreshCalls()).toBe(1);
    expect(results).toEqual([true, true, true]);
  });

  it('asks again once the shared exchange is done', async () => {
    request.mockResolvedValue(session);
    const auth = useAuthStore();

    await auth.tryRefresh();
    await auth.tryRefresh();

    // Sharing lasts as long as the request does, not for the session: a token
    // that expires an hour later has to be exchanged again.
    expect(refreshCalls()).toBe(2);
  });

  it('ends the session for every waiter when the exchange fails', async () => {
    request.mockRejectedValue(new Error('no cookie'));
    const auth = useAuthStore();
    auth.accessToken = 'expired';
    auth.permissions = { global: ['MANAGE_USERS'], perAccount: [] };

    const results = await Promise.all([auth.tryRefresh(), auth.tryRefresh()]);

    expect(results).toEqual([false, false]);
    expect(refreshCalls()).toBe(1);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.permissions).toBeNull();
  });

  it('can exchange again after a failed attempt', async () => {
    request.mockRejectedValueOnce(new Error('no cookie'));
    const auth = useAuthStore();

    expect(await auth.tryRefresh()).toBe(false);

    request.mockResolvedValue(session);
    expect(await auth.tryRefresh()).toBe(true);
    expect(auth.accessToken).toBe('fresh');
  });
});
