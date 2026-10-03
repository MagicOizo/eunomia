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

export interface NavItem {
  to: string;
  title: string;
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
 * German labels mirror the first attempt's sidebar.
 */
export const mainNav: NavItem[] = [
  { to: '/', title: 'Startseite', icon: faHouse },
  {
    to: '/invoices',
    title: 'Rechnungen',
    icon: faFileInvoiceDollar,
    permission: PERMISSIONS.VIEW_INVOICES,
  },
  {
    to: '/accounts',
    title: 'Versicherte',
    icon: faUserGroup,
    permission: PERMISSIONS.VIEW_ACCOUNTS,
  },
  { to: '/contracts', title: 'Policen', icon: faAward, permission: PERMISSIONS.VIEW_CONTRACTS },
  { to: '/companies', title: 'Versicherungen', icon: faBuildingShield },
  { to: '/facilities', title: 'Leistungserbringer', icon: faHouseMedical },
  { to: '/agencies', title: 'Abrechnungsdienstleister', icon: faSackDollar },
  {
    to: '/billings',
    title: 'Leistungsabrechnungen',
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
    title: 'Nutzer & Rechte',
    icon: faUsersGear,
    permission: PERMISSIONS.MANAGE_USERS,
  },
  {
    to: '/system/trash',
    title: 'Papierkorb',
    icon: faTrashCan,
    permission: PERMISSIONS.MANAGE_TRASH,
  },
  {
    to: '/system/settings',
    title: 'Einstellungen',
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
