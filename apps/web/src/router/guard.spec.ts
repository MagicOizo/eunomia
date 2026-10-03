import { describe, expect, it } from 'vitest';

import { type RouteAccessMeta, type RouteAccessRights, routeRejection } from './guard';

/** A signed-in user holding exactly these permissions. */
function rights(
  global: string[],
  perAccount: Array<{ accountUID: string; permissionKey: string }> = [],
): RouteAccessRights {
  return {
    isAuthenticated: true,
    can: (permission, accountUID) =>
      global.includes(permission) ||
      (accountUID !== undefined &&
        perAccount.some((g) => g.accountUID === accountUID && g.permissionKey === permission)),
    canAny: (permission) =>
      global.includes(permission) || perAccount.some((g) => g.permissionKey === permission),
  };
}

describe('routeRejection', () => {
  it('sends a visitor without a session to the login', () => {
    const anonymous: RouteAccessRights = {
      isAuthenticated: false,
      can: () => true,
      canAny: () => true,
    };

    expect(routeRejection({ requiresAuth: true }, {}, anonymous)).toBe('login');
  });

  it('lets a page through that needs nothing but a login', () => {
    expect(routeRejection({ requiresAuth: true }, {}, rights([]))).toBeNull();
  });

  it('turns away an area the user has no permission for', () => {
    // The trash hangs on MANAGE_TRASH, not on MANAGE_USERS — the mix-up CR-26
    // found in the sidebar and the route alike.
    const admin = rights(['MANAGE_USERS']);

    expect(routeRejection({ requiresAuth: true, permission: 'MANAGE_TRASH' }, {}, admin)).toBe(
      'home',
    );
    expect(
      routeRejection({ requiresAuth: true, permission: 'MANAGE_USERS' }, {}, admin),
    ).toBeNull();
  });

  it('opens an area for a permission held on any one account', () => {
    const scoped = rights([], [{ accountUID: 'a-1', permissionKey: 'VIEW_INVOICES' }]);

    // The invoice list has no account in the path; the page narrows itself.
    expect(
      routeRejection({ requiresAuth: true, permission: 'VIEW_INVOICES' }, {}, scoped),
    ).toBeNull();
  });

  it('checks the account in the path against the grant', () => {
    const scoped = rights([], [{ accountUID: 'a-1', permissionKey: 'VIEW_INVOICES' }]);
    const meta: RouteAccessMeta = {
      requiresAuth: true,
      permission: 'VIEW_INVOICES',
      accountParam: 'accountUID',
    };

    expect(routeRejection(meta, { accountUID: 'a-1' }, scoped)).toBeNull();
    expect(routeRejection(meta, { accountUID: 'a-2' }, scoped)).toBe('home');
    // A repeated parameter arrives as an array, which names no single account.
    expect(routeRejection(meta, { accountUID: ['a-1', 'a-2'] }, scoped)).toBe('home');
  });
});
