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
  faUserGroup,
  faUsersGear,
} from '@fortawesome/free-solid-svg-icons';

export interface NavItem {
  to: string;
  title: string;
  icon: IconDefinition;
}

/**
 * The fixed main navigation (see Notes/eunomia-plan.md, 2.7): the structure is
 * set once here and later slices only fill in the target pages. Icons and
 * German labels mirror the first attempt's sidebar.
 */
export const mainNav: NavItem[] = [
  { to: '/', title: 'Startseite', icon: faHouse },
  { to: '/invoices', title: 'Rechnungen', icon: faFileInvoiceDollar },
  { to: '/accounts', title: 'Versicherte', icon: faUserGroup },
  { to: '/contracts', title: 'Policen', icon: faAward },
  { to: '/companies', title: 'Versicherungen', icon: faBuildingShield },
  { to: '/facilities', title: 'Leistungserbringer', icon: faHouseMedical },
  { to: '/agencies', title: 'Abrechnungsdienstleister', icon: faSackDollar },
  { to: '/billings', title: 'Leistungsabrechnungen', icon: faReceipt },
];

/** The separate admin/system area, only shown to users with admin rights. */
export const systemNav: NavItem[] = [
  { to: '/system/users', title: 'Nutzer & Rechte', icon: faUsersGear },
  { to: '/system/settings', title: 'Einstellungen', icon: faGear },
];
