import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import './design-system/fonts.css';
import './design-system/tokens.css';
import './design-system/global.css';
import { i18n } from './lib/i18n';
import { followLocalePreferences, loadInstanceDefaults } from './lib/locale-preferences';
import { router } from './router';
import { useAuthStore } from './stores/auth';

/**
 * Restore any existing session from the refresh cookie BEFORE installing the
 * router, because `app.use(router)` immediately kicks off the initial
 * navigation — and its auth guard must see the restored session, otherwise a
 * reload of a protected page always bounces to /login even with a valid cookie.
 */
async function bootstrap(): Promise<void> {
  const app = createApp(App);
  app.use(i18n);
  app.use(createPinia());

  // Both before the first render, so the login page already speaks the
  // resolved language instead of flashing German first.
  await Promise.all([useAuthStore().initialize(), loadInstanceDefaults()]);
  followLocalePreferences();

  app.use(router);
  await router.isReady();
  app.mount('#app');
}

void bootstrap();
