import type { Pool } from 'mariadb';

import type { AuthConfig } from '../config/env.js';
import { readLoginSwitches } from '../settings/repository.js';

type ForceConfig = Pick<AuthConfig, 'passwordLoginForce'>;

/**
 * The one answer to "may anyone sign in with a password?" (Slice 90, blueprint
 * section 2): the stored switch, outweighed by PASSWORD_LOGIN_FORCE. Everything
 * that cares asks here — the login endpoint, the public login options, and
 * (Slice 91) the lock on undoing one's own link — so the page can never hide a
 * form the server would have taken, or offer one it refuses.
 */
export function passwordLoginOpen(storedSwitch: boolean, config: ForceConfig): boolean {
  return config.passwordLoginForce || storedSwitch;
}

/** The same answer, reading the stored switch itself. */
export async function passwordLoginAllowed(pool: Pool, config: ForceConfig): Promise<boolean> {
  // The force needs no database round trip.
  if (config.passwordLoginForce) return true;
  const { passwordEnabled } = await readLoginSwitches(pool);
  return passwordLoginOpen(passwordEnabled, config);
}
