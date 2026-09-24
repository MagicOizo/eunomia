import { createRouter, createWebHistory } from 'vue-router';

import SettingsView from '../admin/SettingsView.vue';
import UsersView from '../admin/UsersView.vue';
import ResourceView from '../components/resource/ResourceView.vue';
import BillingPickerView from '../invoices/BillingPickerView.vue';
import BillingsView from '../invoices/BillingsView.vue';
import InvoicePickerView from '../invoices/InvoicePickerView.vue';
import InvoiceWorkspaceView from '../invoices/InvoiceWorkspaceView.vue';
import { resourceConfigs } from '../resources/definitions';
import { useAuthStore } from '../stores/auth';
import DashboardView from '../views/DashboardView.vue';
import LoginView from '../views/LoginView.vue';
import PlaceholderView from '../views/PlaceholderView.vue';
import { mainNav, systemNav } from './nav';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
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
  ...systemNav.filter((item) => item.to !== '/system/users' && item.to !== '/system/settings'),
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
      requiresAdmin: item.to.startsWith('/system'),
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
      path: '/invoices',
      name: '/invoices',
      component: InvoicePickerView,
      meta: { title: 'Rechnungen', requiresAuth: true },
    },
    {
      path: '/invoices/:accountUID',
      name: 'invoices-account',
      component: InvoiceWorkspaceView,
      props: true,
      meta: { title: 'Rechnungen', requiresAuth: true },
    },
    {
      path: '/system/users',
      name: '/system/users',
      component: UsersView,
      meta: { title: 'Nutzer & Rechte', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/system/settings',
      name: '/system/settings',
      component: SettingsView,
      meta: { title: 'Einstellungen', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/billings',
      name: '/billings',
      component: BillingPickerView,
      meta: { title: 'Leistungsabrechnungen', requiresAuth: true },
    },
    {
      path: '/billings/:contractUID',
      name: 'billings-contract',
      component: BillingsView,
      props: true,
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
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' };
  }
  return true;
});
