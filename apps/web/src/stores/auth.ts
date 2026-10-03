import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { request } from '../lib/http';

export interface AuthUser {
  uuid: string;
  email: string;
  firstname: string;
  surname: string | null;
}

interface EffectivePermissions {
  global: string[];
  perAccount: Array<{ accountUID: string; permissionKey: string }>;
}

interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
  permissions: EffectivePermissions;
  /** Admin-only: the one-time setup endpoint is still open (SETUP_TOKEN set). */
  setupTokenActive: boolean;
}

/**
 * Auth store. The access token is held ONLY in memory (never localStorage) to
 * avoid XSS persistence (see Notes/eunomia-plan.md, 1.3.5); it is restored
 * after a reload via the httpOnly refresh cookie in `initialize()`. Permissions
 * are loaded from /me and drive nav visibility.
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const permissions = ref<EffectivePermissions | null>(null);
  const setupTokenActive = ref(false);

  const isAuthenticated = computed(() => accessToken.value !== null);

  /** True when the user holds the permission globally (account-scoped grants ignored here). */
  function hasGlobalPermission(key: string): boolean {
    return permissions.value?.global.includes(key) ?? false;
  }
  const isAdmin = computed(() => hasGlobalPermission('MANAGE_USERS'));

  function clear(): void {
    accessToken.value = null;
    user.value = null;
    permissions.value = null;
    setupTokenActive.value = false;
  }

  async function loadMe(): Promise<void> {
    const me = await request<MeResponse>('/me', { token: accessToken.value });
    user.value = me.user;
    permissions.value = me.permissions;
    setupTokenActive.value = me.setupTokenActive;
  }

  async function login(email: string, password: string): Promise<void> {
    const session = await request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    accessToken.value = session.accessToken;
    await loadMe();
  }

  async function runRefresh(): Promise<boolean> {
    try {
      const session = await request<SessionResponse>('/auth/refresh', { method: 'POST' });
      accessToken.value = session.accessToken;
      return true;
    } catch {
      clear();
      return false;
    }
  }

  /**
   * The refresh in flight, shared by every caller that finds the token expired.
   * Same shape as `pending` in lib/update-status.ts, but here it prevents a bug
   * rather than a second request: the server rotates the refresh token and
   * revokes the one presented, so a second concurrent refresh would present an
   * already revoked token, fail, and `clear()` the session that the first one
   * had just renewed (issues.md 0.16.0-slice.2 24).
   */
  let refreshing: Promise<boolean> | null = null;

  /**
   * Exchanges the refresh cookie for a fresh access token. Returns success.
   * Concurrent callers wait on the same exchange instead of starting their own.
   */
  function tryRefresh(): Promise<boolean> {
    refreshing ??= runRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** On app start, silently restore a session from the refresh cookie if present. */
  async function initialize(): Promise<void> {
    if (await tryRefresh()) await loadMe();
  }

  async function logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort: clear the local session regardless of the server outcome.
    }
    clear();
  }

  return {
    accessToken,
    user,
    permissions,
    setupTokenActive,
    isAuthenticated,
    isAdmin,
    hasGlobalPermission,
    login,
    tryRefresh,
    initialize,
    logout,
  };
});
