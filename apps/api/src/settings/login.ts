import { ERROR_CODES } from '@eunomia/shared';

import { OIDC_TEST_STATUS_KEYS } from '../auth/oidc/connection-test.js';
import { badRequest } from '../lib/api-error.js';
import type { SettingKey, SettingValue } from './registry.js';
import type { PublicSetting } from './repository.js';

/**
 * The rules that span several keys of the `login` section — the registry checks
 * one value at a time and cannot see them (Slice 85, see Notes/eunomia-plan.md
 * "Paket Anmeldung über OIDC"). Slice 90 adds the locks around the password
 * switch here.
 */

/** What sign-in through the provider cannot work without, in the order a page shows them. */
const REQUIRED_FOR_OIDC: readonly SettingKey[] = [
  'general.appUrl',
  'login.oidcIssuer',
  'login.oidcClientId',
  'login.oidcClientSecret',
];

/**
 * Whether `key` holds a value once `updates` are applied. A key absent from the
 * write keeps what is stored; `null` clears it. For a secret the stored state is
 * `isSet`, since its value never reaches this side.
 */
function presentAfter(
  key: SettingKey,
  current: readonly PublicSetting[],
  updates: ReadonlyMap<SettingKey, SettingValue>,
): boolean {
  if (updates.has(key)) return updates.get(key) !== null;
  const row = current.find((entry) => entry.key === key);
  if (row === undefined) return false;
  return row.isSecret ? row.isSet : row.value !== null;
}

/**
 * Rejects a write after which the provider would be switched on without
 * everything it needs. It judges the state the write leads to, not the write
 * alone: clearing the secret or the instance address while the provider is on
 * is refused just like switching it on with them missing. Switching it off is
 * always taken.
 */
export function assertLoginConfiguration(
  current: readonly PublicSetting[],
  updates: ReadonlyMap<SettingKey, SettingValue>,
): void {
  const enabledAfter = updates.has('login.oidcEnabled')
    ? updates.get('login.oidcEnabled') === true
    : current.find((entry) => entry.key === 'login.oidcEnabled')?.value === true;
  if (!enabledAfter) return;

  const missing = REQUIRED_FOR_OIDC.filter((key) => !presentAfter(key, current, updates));
  if (missing.length > 0) {
    throw badRequest(
      `Sign-in through the provider needs these settings first: ${missing.join(', ')}`,
      { code: ERROR_CODES.LOGIN_CONFIG_INCOMPLETE, details: { missing } },
    );
  }
}

/**
 * The keys that say which provider the last connection test spoke to. When one
 * of them changes, that test's result no longer describes the configuration —
 * and a green result is what Slice 90 accepts as evidence before the password
 * login may close.
 */
const TESTED_IDENTITY: readonly SettingKey[] = ['login.oidcIssuer', 'login.oidcClientId'];

/**
 * The status keys a write has to clear along with itself (Slice 86): all of
 * them, when the issuer or client ID changes value, or when the secret is
 * written at all — it is stored encrypted, so "the same secret again" cannot be
 * told apart from a new one. Otherwise none, so saving the button label keeps
 * the status line as it is.
 */
export function oidcTestStatusResetFor(
  current: readonly PublicSetting[],
  updates: ReadonlyMap<SettingKey, SettingValue>,
): SettingKey[] {
  const identityChanged = TESTED_IDENTITY.some((key) => {
    if (!updates.has(key)) return false;
    const stored = current.find((entry) => entry.key === key)?.value ?? null;
    return updates.get(key) !== stored;
  });
  return identityChanged || updates.has('login.oidcClientSecret') ? [...OIDC_TEST_STATUS_KEYS] : [];
}

/**
 * Whether a write touches anything the provider's discovery depends on, so the
 * login route's cache has to be thrown away. Generous on purpose: every `login.*`
 * key and the instance address.
 */
export function touchesOidcConfiguration(updates: ReadonlyMap<SettingKey, SettingValue>): boolean {
  return [...updates.keys()].some((key) => key.startsWith('login.') || key === 'general.appUrl');
}
