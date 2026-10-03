/**
 * The permission keys both sides spell (see Notes/eunomia-plan.md, 2.4). They
 * mirror rows in the `Permissions` catalog table, which is seeded by migrations
 * — the migration is the immutable source of truth for what exists in a given
 * schema version; this object is the compile-time-checked set the code refers
 * to. Adding a permission means both a new migration row and a new entry here.
 *
 * Shared because the API decides access with these names and the web now asks
 * the same questions to decide what to offer (CR-26): one list, so a key the
 * one side checks cannot be a key the other side never grants.
 */
export const PERMISSIONS = {
  VIEW_INVOICES: 'VIEW_INVOICES',
  MANAGE_INVOICES: 'MANAGE_INVOICES',
  VIEW_ACCOUNTS: 'VIEW_ACCOUNTS',
  MANAGE_ACCOUNTS: 'MANAGE_ACCOUNTS',
  VIEW_CONTRACTS: 'VIEW_CONTRACTS',
  MANAGE_CONTRACTS: 'MANAGE_CONTRACTS',
  MANAGE_FACILITIES: 'MANAGE_FACILITIES',
  MANAGE_COMPANIES: 'MANAGE_COMPANIES',
  MANAGE_AGENCIES: 'MANAGE_AGENCIES',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  MANAGE_TRASH: 'MANAGE_TRASH',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * The permissions that are answered from GLOBAL grants only — they belong to
 * things that have no insured person: logins, system settings, master data, the
 * trash (Notes/eunomia-plan.md, 2.4, decided 2026-10-03). The same role bound
 * to a single account through `UserAccountRoles` therefore carries these
 * permissions without effect; whoever should hold one gets it globally.
 */
export const INSTANCE_PERMISSIONS = [
  PERMISSIONS.MANAGE_USERS,
  PERMISSIONS.MANAGE_SETTINGS,
  PERMISSIONS.MANAGE_TRASH,
  PERMISSIONS.MANAGE_FACILITIES,
  PERMISSIONS.MANAGE_COMPANIES,
  PERMISSIONS.MANAGE_AGENCIES,
] as const;

export type InstancePermission = (typeof INSTANCE_PERMISSIONS)[number];

const instanceSet: ReadonlySet<string> = new Set(INSTANCE_PERMISSIONS);

/** True when the permission is instance-wide, so an account-scoped grant of it counts for nothing. */
export function isInstancePermission(permission: PermissionKey): boolean {
  return instanceSet.has(permission);
}
