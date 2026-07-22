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
  }

  async function loadMe(): Promise<void> {
    const me = await request<MeResponse>('/me', { token: accessToken.value });
    user.value = me.user;
    permissions.value = me.permissions;
  }

  async function login(email: string, password: string): Promise<void> {
    const session = await request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    accessToken.value = session.accessToken;
    await loadMe();
  }

  /** Exchanges the refresh cookie for a fresh access token. Returns success. */
  async function tryRefresh(): Promise<boolean> {
    try {
      const session = await request<SessionResponse>('/auth/refresh', { method: 'POST' });
      accessToken.value = session.accessToken;
      return true;
    } catch {
      clear();
      return false;
    }
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
    isAuthenticated,
    isAdmin,
    hasGlobalPermission,
    login,
    tryRefresh,
    initialize,
    logout,
  };
});
