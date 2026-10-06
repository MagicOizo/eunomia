import type { PermissionKey } from '@eunomia/shared';

import { i18n } from '../lib/i18n';

/**
 * Names for the roles and permissions the API hands out as data (Slice 79).
 *
 * The two system roles are seeded by migration 002 with a German name ("Admin",
 * "Nutzer") and an English description; both are rows, not texts of the UI. A
 * system role is therefore named from the catalogue by the name it was seeded
 * with — the name is unique and cannot be edited — and any other role keeps
 * the name and description someone gave it.
 */

const { t } = i18n.global;

interface RoleTexts {
  name: () => string;
  description: () => string;
}

const SYSTEM_ROLES: Record<string, RoleTexts> = {
  Admin: {
    name: () => t('roles.system.Admin.name'),
    description: () => t('roles.system.Admin.description'),
  },
  Nutzer: {
    name: () => t('roles.system.Nutzer.name'),
    description: () => t('roles.system.Nutzer.description'),
  },
};

/** The name a role is shown with: from the catalogue for a system role. */
export function roleName(name: string): string {
  return SYSTEM_ROLES[name]?.name() ?? name;
}

/** What a role is for: from the catalogue for a system role, else as stored. */
export function roleDescription(role: { roleName: string; description: string | null }): string {
  return SYSTEM_ROLES[role.roleName]?.description() ?? role.description ?? '';
}

/** A `Record` over every key, so a new permission without a name does not compile. */
const PERMISSION_NAMES: Record<PermissionKey, () => string> = {
  VIEW_INVOICES: () => t('permissions.VIEW_INVOICES'),
  MANAGE_INVOICES: () => t('permissions.MANAGE_INVOICES'),
  VIEW_ACCOUNTS: () => t('permissions.VIEW_ACCOUNTS'),
  MANAGE_ACCOUNTS: () => t('permissions.MANAGE_ACCOUNTS'),
  VIEW_CONTRACTS: () => t('permissions.VIEW_CONTRACTS'),
  MANAGE_CONTRACTS: () => t('permissions.MANAGE_CONTRACTS'),
  MANAGE_FACILITIES: () => t('permissions.MANAGE_FACILITIES'),
  MANAGE_COMPANIES: () => t('permissions.MANAGE_COMPANIES'),
  MANAGE_AGENCIES: () => t('permissions.MANAGE_AGENCIES'),
  MANAGE_USERS: () => t('permissions.MANAGE_USERS'),
  MANAGE_SETTINGS: () => t('permissions.MANAGE_SETTINGS'),
  MANAGE_TRASH: () => t('permissions.MANAGE_TRASH'),
};

/** A permission's name; a key this build does not know is shown as it is. */
export function permissionName(key: string): string {
  const name = PERMISSION_NAMES[key as PermissionKey] as (() => string) | undefined;
  return name ? name() : key;
}
