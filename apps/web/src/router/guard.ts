import type { PermissionKey } from '@eunomia/shared';

/**
 * What a route says about itself — the fields the guard reads (see the
 * `RouteMeta` declaration in index.ts).
 */
export interface RouteAccessMeta {
  requiresAuth?: boolean;
  /** The permission the page needs; absent means a login is enough. */
  permission?: PermissionKey;
  /**
   * The route parameter holding the account the permission is checked against
   * (e.g. 'accountUID' for /invoices/:accountUID). Without it the permission is
   * asked for any account — the page then narrows what it shows itself.
   */
  accountParam?: string;
}

/** The two questions the guard asks the auth store, so it can be tested without one. */
export interface RouteAccessRights {
  isAuthenticated: boolean;
  can: (permission: PermissionKey, accountUID?: string) => boolean;
  canAny: (permission: PermissionKey) => boolean;
}

/** Where a blocked route sends the visitor, or `null` when it may be entered. */
export type RouteRejection = 'login' | 'home';

/**
 * Whether a route may be entered, kept apart from the router so the rule can be
 * read and tested on its own (like the invoice rules of Slice 59). An
 * unauthenticated visitor goes to the login and keeps the path they wanted; a
 * missing permission sends them home, because there is nothing to do on a page
 * the API would answer with 403.
 */
export function routeRejection(
  meta: RouteAccessMeta,
  params: Record<string, unknown>,
  rights: RouteAccessRights,
): RouteRejection | null {
  if (meta.requiresAuth && !rights.isAuthenticated) return 'login';
  if (meta.permission === undefined) return null;

  const raw = meta.accountParam === undefined ? undefined : params[meta.accountParam];
  const accountUID = typeof raw === 'string' ? raw : undefined;
  const allowed =
    meta.accountParam === undefined
      ? rights.canAny(meta.permission)
      : rights.can(meta.permission, accountUID);
  return allowed ? null : 'home';
}
