import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import './design-system/fonts.css';
import './design-system/tokens.css';
import './design-system/global.css';
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
  app.use(createPinia());

  await useAuthStore().initialize();

  app.use(router);
  await router.isReady();
  app.mount('#app');
}

void bootstrap();
