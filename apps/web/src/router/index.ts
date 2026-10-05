import { PERMISSIONS, type PermissionKey } from '@eunomia/shared';
import { type LocationQueryValue, createRouter, createWebHistory } from 'vue-router';

import SettingsView from '../admin/SettingsView.vue';
import UsersView from '../admin/UsersView.vue';
import ResourceView from '../components/resource/ResourceView.vue';
import BillingPickerView from '../invoices/BillingPickerView.vue';
import BillingsView from '../invoices/BillingsView.vue';
import InvoicePickerView from '../invoices/InvoicePickerView.vue';
import InvoiceWorkspaceView from '../invoices/InvoiceWorkspaceView.vue';
import ProfileView from '../profile/ProfileView.vue';
import { resourceConfigs } from '../resources/definitions';
import TrashView from '../trash/TrashView.vue';
import { useAuthStore } from '../stores/auth';
import DashboardView from '../views/DashboardView.vue';
import LoginView from '../views/LoginView.vue';
import PlaceholderView from '../views/PlaceholderView.vue';
import { routeRejection } from './guard';
import { mainNav, systemNav } from './nav';

/** One query value as a plain string; a repeated parameter yields an array. */
function queryString(value: LocationQueryValue | LocationQueryValue[]): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
    /** The permission the page needs — the same one its endpoints require (CR-26). */
    permission?: PermissionKey;
    /** The route parameter naming the account that permission is about (see guard.ts). */
    accountParam?: string;
    layout?: 'blank';
  }
}

/**
 * Routes are generated from the fixed nav config (see nav.ts). Entries with a
 * resource config (Slice 4/7 master data) render the CRUD view; the rest stay
 * placeholders until their slice lands.
 */
// '/invoices' (picker + workspace) and '/billings' (bespoke view) have their own
// routes below, so they are excluded from the generated placeholder/CRUD routes.
const navRoutes = [
  ...mainNav.filter(
    (item) => item.to !== '/' && item.to !== '/invoices' && item.to !== '/billings',
  ),
  ...systemNav.filter(
    (item) =>
      item.to !== '/system/users' && item.to !== '/system/settings' && item.to !== '/system/trash',
  ),
].map((item) => {
  const config = resourceConfigs[item.to];
  return {
    path: item.to,
    name: item.to,
    component: config ? ResourceView : PlaceholderView,
    props: config ? { config } : undefined,
    meta: {
      title: item.title,
      requiresAuth: true,
      permission: item.permission,
    },
  };
});

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { layout: 'blank', title: 'Anmelden' },
    },
    {
      path: '/',
      name: 'home',
      component: DashboardView,
      meta: { title: 'Startseite', requiresAuth: true },
    },
    {
      // The search filter lives in the URL (Slice 45): the filter buttons of
      // the master-data lists point here, and a followed hit finds its way back.
      path: '/invoices',
      name: '/invoices',
      component: InvoicePickerView,
      props: (route) => ({
        q: queryString(route.query.q),
        agency: queryString(route.query.agency),
        account: queryString(route.query.account),
        facility: queryString(route.query.facility),
        status: queryString(route.query.status),
      }),
      meta: { title: 'Rechnungen', requiresAuth: true, permission: PERMISSIONS.VIEW_INVOICES },
    },
    {
      // `year` and `invoice` come from the invoice-number search on /invoices:
      // handed in as props, so the workspace stays prop-driven and testable
      // without a router.
      path: '/invoices/:accountUID',
      name: 'invoices-account',
      component: InvoiceWorkspaceView,
      props: (route) => ({
        accountUID: route.params.accountUID,
        focusYear: queryString(route.query.year),
        focusInvoiceUID: queryString(route.query.invoice),
      }),
      meta: {
        title: 'Rechnungen',
        requiresAuth: true,
        permission: PERMISSIONS.VIEW_INVOICES,
        accountParam: 'accountUID',
      },
    },
    {
      path: '/system/users',
      name: '/system/users',
      component: UsersView,
      meta: { title: 'Nutzer & Rechte', requiresAuth: true, permission: PERMISSIONS.MANAGE_USERS },
    },
    {
      path: '/system/trash',
      name: '/system/trash',
      component: TrashView,
      meta: { title: 'Papierkorb', requiresAuth: true, permission: PERMISSIONS.MANAGE_TRASH },
    },
    {
      path: '/system/settings',
      name: '/system/settings',
      component: SettingsView,
      meta: { title: 'Einstellungen', requiresAuth: true, permission: PERMISSIONS.MANAGE_SETTINGS },
    },
    {
      // The user's own account (Slice 7 of the review slices). Deliberately not
      // in router/nav.ts: mainNav/systemNav are the fixed navigation of plan
      // §2.7, and one's own account is not an area within it — the name in the
      // sidebar footer leads here.
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { title: 'Mein Konto', requiresAuth: true },
    },
    {
      // Like /invoices: the search across every policy keeps its filter in the URL.
      path: '/billings',
      name: '/billings',
      component: BillingPickerView,
      props: (route) => ({
        q: queryString(route.query.q),
        unlinked: queryString(route.query.unlinked),
      }),
      meta: {
        title: 'Leistungsabrechnungen',
        requiresAuth: true,
        permission: PERMISSIONS.VIEW_INVOICES,
      },
    },
    {
      path: '/billings/:contractUID',
      name: 'billings-contract',
      component: BillingsView,
      // `billing` comes from the billing search on /billings: the row to mark.
      props: (route) => ({
        contractUID: route.params.contractUID,
        focusBillingUID: queryString(route.query.billing),
      }),
      // No permission in the meta: the account hangs on the policy, not on the
      // path, so there is nothing here to check it against. Without the right
      // the API answers 403 and the page shows that sentence.
      meta: { title: 'Leistungsabrechnungen', requiresAuth: true },
    },
    ...navRoutes,
    {
      path: '/styleguide',
      name: 'styleguide',
      // The Slice 1 living style guide, kept reachable as a developer reference.
      component: () => import('../design-system/StyleGuideView.vue'),
      meta: { title: 'Style-Guide' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const rejection = routeRejection(to.meta, to.params, auth);
  if (rejection === 'login') return { name: 'login', query: { redirect: to.fullPath } };
  if (rejection === 'home') return { name: 'home' };
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' };
  }
  return true;
});
