<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import BlankLayout from './layouts/BlankLayout.vue';
import DefaultLayout from './layouts/DefaultLayout.vue';

const route = useRoute();
// Login (and any other 'blank' route) renders without the app shell.
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout));
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
</template>
