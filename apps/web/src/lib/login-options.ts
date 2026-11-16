import type { LoginOptions } from '@eunomia/shared';

import { request } from './http';

/** What the page shows while it asks, and when it cannot: the password form alone. */
export const FALLBACK_LOGIN_OPTIONS: LoginOptions = { password: true, oidc: null };

/**
 * Asks the API which ways in the login page offers (Slice 89) — without a
 * token, nobody has signed in yet. A failure costs the button and nothing
 * else: the page has to load even when this one request does not.
 */
export async function loadLoginOptions(): Promise<LoginOptions> {
  try {
    return (await request<{ data: LoginOptions }>('/login-options')).data;
  } catch {
    return FALLBACK_LOGIN_OPTIONS;
  }
}
