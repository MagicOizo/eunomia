import { apiFetch } from '../lib/api';

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
