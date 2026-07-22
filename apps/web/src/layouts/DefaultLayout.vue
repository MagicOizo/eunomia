<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import AppFooter from '../components/layout/AppFooter.vue';
import AppHeader from '../components/layout/AppHeader.vue';
import AppSidebar from '../components/layout/AppSidebar.vue';

const route = useRoute();
const title = computed(() => route.meta.title ?? 'Eunomia');

const sidebarOpen = ref(false);
// Close the mobile drawer whenever the route changes.
watch(() => route.fullPath, () => (sidebarOpen.value = false));
</script>

<template>
  <div class="eu-app">
    <div class="eu-shell">
      <AppSidebar :open="sidebarOpen" @navigate="sidebarOpen = false" />
      <div v-if="sidebarOpen" class="eu-backdrop" @click="sidebarOpen = false" />

      <div class="eu-main-col">
        <main class="eu-main">
          <AppHeader :title="title" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
          <div class="eu-main__content">
            <slot />
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  </div>
</template>

<style scoped>
.eu-app {
  min-height: 100vh;
  background-color: var(--eu-color-page-bg);
}

.eu-shell {
  display: flex;
  min-height: 100vh;
}

.eu-main-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 1.25rem;
}

/* The white rounded card floating on the brand-blue page — the first attempt's
   signature look (see eunomia-description.md §9). */
.eu-main {
  flex: 1;
  min-width: 0;
  padding: 1.5rem 2rem;
  background-color: var(--eu-color-surface-bg);
  border-radius: 1rem;
  box-shadow: 0 1rem 2rem rgb(0 0 0 / 18%);
}

.eu-main__content {
  min-width: 0;
  overflow-x: auto;
}

.eu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 15;
  background-color: rgb(0 0 0 / 40%);
}

@media (min-width: 48.0625rem) {
  .eu-backdrop {
    display: none;
  }
}
</style>
