/**
 * The two locks in front of the password switch (Slice 90), worked out the way
 * the API does in apps/api/src/settings/login.ts — so the form does not offer
 * what the server refuses:
 *
 * - `no_way_in`: the password login and the provider would both be off.
 * - `test_required`: the step from open to closed, without a green last test of
 *   the provider *as saved*. A changed issuer or client ID, or a typed secret,
 *   would clear that status with the same write, so they count as no test.
 *
 * Opening the password login again is never blocked. PASSWORD_LOGIN_FORCE plays
 * no part — it is the host's way out, not a door the form may count on.
 */
export type PasswordDoorBlock = 'no_way_in' | 'test_required' | null;

export interface PasswordDoorState {
  /** The form as it would be saved. */
  passwordEnabled: boolean;
  oidcEnabled: boolean;
  /** Issuer or client ID differ from what is stored, or a secret is typed. */
  providerChanged: boolean;
  /** What is stored now. */
  storedPasswordEnabled: boolean;
  /** The last connection test, as stored, was green. */
  lastTestOk: boolean;
}

export function passwordDoorBlock(state: PasswordDoorState): PasswordDoorBlock {
  if (state.passwordEnabled) return null;
  if (!state.oidcEnabled) return 'no_way_in';
  if (!state.storedPasswordEnabled) return null;
  return state.lastTestOk && !state.providerChanged ? null : 'test_required';
}
