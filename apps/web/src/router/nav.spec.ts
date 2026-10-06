import type { PermissionKey } from '@eunomia/shared';
import { describe, expect, it } from 'vitest';

import { i18n } from '../lib/i18n';
import { mainNav, systemNav, visibleNav } from './nav';

/** `canAny` for a user holding exactly these permissions. */
const holding =
  (...held: PermissionKey[]) =>
  (permission: PermissionKey): boolean =>
    held.includes(permission);

const titles = (items: typeof mainNav): string[] =>
  items.map((item) => i18n.global.t(item.titleKey));

describe('visibleNav', () => {
  it('keeps what needs nothing but a login', () => {
    // The master-data lists are readable for every authenticated user (see the
    // API's crud/master-data-router.ts), so they stay — and the dashboard too.
    expect(titles(visibleNav(mainNav, holding()))).toEqual([
      'Startseite',
      'Versicherungen',
      'Leistungserbringer',
      'Abrechnungsdienstleister',
    ]);
  });

  it('opens the invoice areas on VIEW_INVOICES', () => {
    const visible = titles(visibleNav(mainNav, holding('VIEW_INVOICES')));

    expect(visible).toContain('Rechnungen');
    expect(visible).toContain('Leistungsabrechnungen');
    expect(visible).not.toContain('Versicherte');
  });

  it('shows each system area for its own permission', () => {
    // Before CR-26 all three hung on MANAGE_USERS, which left MANAGE_TRASH
    // granted and without effect.
    expect(titles(visibleNav(systemNav, holding('MANAGE_TRASH')))).toEqual(['Papierkorb']);
    expect(titles(visibleNav(systemNav, holding('MANAGE_USERS')))).toEqual(['Nutzer & Rechte']);
    expect(visibleNav(systemNav, holding())).toEqual([]);
  });
});
