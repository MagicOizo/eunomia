<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';

import BlankLayout from './layouts/BlankLayout.vue';
import DefaultLayout from './layouts/DefaultLayout.vue';
import { appTitle, loadAppInfo } from './lib/app-info';

const route = useRoute();
// Login (and any other 'blank' route) renders without the app shell.
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout));

/*
 * The browser tab names the environment (Eunomia-DEV and friends). Set here
 * rather than in DefaultLayout so it also applies to the login page, which
 * renders without the app shell. Until the answer arrives — or if it never
 * does — the static title from index.html stands.
 */
onMounted(async () => {
  const info = await loadAppInfo();
  if (info) document.title = appTitle(info.environment);
});
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
</template>
