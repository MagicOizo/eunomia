import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import './design-system/fonts.css';
import './design-system/tokens.css';
import './design-system/global.css';
import { router } from './router';
import { useAuthStore } from './stores/auth';

const app = createApp(App);
app.use(createPinia());
app.use(router);

/**
 * Restore any existing session from the refresh cookie before the first
 * navigation resolves, so route guards see the correct auth state and the user
 * is not bounced to the login page on every reload.
 */
async function bootstrap(): Promise<void> {
  await useAuthStore().initialize();
  await router.isReady();
  app.mount('#app');
}

void bootstrap();
