import { PERMISSIONS, type PermissionKey } from '@eunomia/shared';
import { useAuthStore } from '../stores/auth';

/** One account-scoped grant, as /me reports it. */
interface AccountGrant {
  accountUID: string;
  permissionKey: PermissionKey;
}

/**
 * Puts the signed-in user of the active pinia on exactly these grants. Every
 * test starts as a global admin (see setup.ts); a case that is about what the
 * interface withholds says here what the user actually holds.
 */
export function grant(grants: { global?: PermissionKey[]; perAccount?: AccountGrant[] }): void {
  useAuthStore().permissions = {
    global: grants.global ?? [],
    perAccount: grants.perAccount ?? [],
  };
}

/** Every permission, globally — the state of the instance as it is run today. */
export function grantEverything(): void {
  grant({ global: Object.values(PERMISSIONS) });
}
