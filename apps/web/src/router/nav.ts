import { PERMISSIONS, type PermissionKey } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faAward,
  faBuildingShield,
  faFileInvoiceDollar,
  faGear,
  faHouse,
  faHouseMedical,
  faReceipt,
  faSackDollar,
  faTrashCan,
  faUserGroup,
  faUsersGear,
} from '@fortawesome/free-solid-svg-icons';

import type { MessageSchema } from '../lib/i18n';

/** A page title: one of the `nav.*` entries of the catalogue. */
export type NavTitleKey = `nav.${keyof MessageSchema['nav'] & string}`;

export interface NavItem {
  to: string;
  titleKey: NavTitleKey;
  icon: IconDefinition;
  /**
   * The permission that opens this area — globally or for any one account
   * (see visibleNav). Without one the area needs nothing but a login: the
   * master-data lists are readable for every authenticated user, only writing
   * them is bound (see the API's crud/master-data-router.ts).
   */
  permission?: PermissionKey;
}

/**
 * The fixed main navigation (see Notes/eunomia-plan.md, 2.7): the structure is
 * set once here and later slices only fill in the target pages. Icons and
 * labels mirror the first attempt's sidebar.
 */
export const mainNav: NavItem[] = [
  { to: '/', titleKey: 'nav.home', icon: faHouse },
  {
    to: '/invoices',
    titleKey: 'nav.invoices',
    icon: faFileInvoiceDollar,
    permission: PERMISSIONS.VIEW_INVOICES,
  },
  {
    to: '/accounts',
    titleKey: 'nav.accounts',
    icon: faUserGroup,
    permission: PERMISSIONS.VIEW_ACCOUNTS,
  },
  {
    to: '/contracts',
    titleKey: 'nav.contracts',
    icon: faAward,
    permission: PERMISSIONS.VIEW_CONTRACTS,
  },
  { to: '/companies', titleKey: 'nav.companies', icon: faBuildingShield },
  { to: '/facilities', titleKey: 'nav.facilities', icon: faHouseMedical },
  { to: '/agencies', titleKey: 'nav.agencies', icon: faSackDollar },
  {
    to: '/billings',
    titleKey: 'nav.billings',
    icon: faReceipt,
    permission: PERMISSIONS.VIEW_INVOICES,
  },
];

/**
 * The separate admin/system area. Each entry names the instance-wide
 * permission its page needs — the same one the API requires, so a role that
 * carries only `MANAGE_TRASH` finds the trash and nothing else (CR-26: before
 * this, all three hung on `MANAGE_USERS`).
 */
export const systemNav: NavItem[] = [
  {
    to: '/system/users',
    titleKey: 'nav.users',
    icon: faUsersGear,
    permission: PERMISSIONS.MANAGE_USERS,
  },
  {
    to: '/system/trash',
    titleKey: 'nav.trash',
    icon: faTrashCan,
    permission: PERMISSIONS.MANAGE_TRASH,
  },
  {
    to: '/system/settings',
    titleKey: 'nav.settings',
    icon: faGear,
    permission: PERMISSIONS.MANAGE_SETTINGS,
  },
];

/**
 * The entries this user can actually reach — the sidebar and the dashboard
 * cards read the same filter, so neither can offer a page the route guard
 * turns away. An area is listed when its permission is held for any account:
 * the page itself then narrows what it shows to those accounts.
 */
export function visibleNav(
  items: NavItem[],
  canAny: (permission: PermissionKey) => boolean,
): NavItem[] {
  return items.filter((item) => item.permission === undefined || canAny(item.permission));
}
