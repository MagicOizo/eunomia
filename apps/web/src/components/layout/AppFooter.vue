<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { request } from '../../lib/http';

const year = new Date().getFullYear();
const version = ref<string | null>(null);

// The backend version comes from the public version endpoint (Slice 0). Shown
// in the footer per Notes/eunomia-plan.md, Slice 6.
onMounted(async () => {
  try {
    const res = await request<{ version: string }>('/version');
    version.value = res.version;
  } catch {
    version.value = null;
  }
});
</script>

<template>
  <footer class="eu-footer">
    <span>&copy; {{ year }} Max Zöller</span>
    <span v-if="version" class="eu-footer__version">Backend v{{ version }}</span>
  </footer>
</template>

<style scoped>
.eu-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 0.5rem 0.25rem;
  font-size: 0.8rem;
  color: var(--eu-color-text-inverse-muted);
}

.eu-footer__version {
  font-family: var(--eu-font-data);
}
</style>
