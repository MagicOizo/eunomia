import type { FormatRegion, Locale } from '@eunomia/shared';

import { apiFetch } from '../lib/api';
import type { AuthUser } from '../stores/auth';

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/**
 * The one way to change one's own password (the admin API refuses it for one's
 * own account). Answers 204 and ends every other session of this user; the one
 * that asked keeps its refresh cookie.
 *
 * Not in stores/auth.ts, where it would otherwise belong: that store must not
 * import lib/api.ts, which imports the store.
 */
export async function changePassword(body: ChangePasswordBody): Promise<void> {
  await apiFetch('/auth/password', { method: 'POST', body });
}

export interface LocalePreferencesBody {
  locale?: Locale | null;
  formatRegion?: FormatRegion | null;
}

/**
 * Stores one's own language and/or format (`null` = follow browser and
 * instance again) and answers with the updated user, which the caller puts
 * into the auth store — the interface switches through lib/locale-preferences.ts.
 */
export async function updateLocalePreferences(body: LocalePreferencesBody): Promise<AuthUser> {
  const answer = await apiFetch<{ user: AuthUser }>('/me', { method: 'PATCH', body });
  return answer.user;
}
