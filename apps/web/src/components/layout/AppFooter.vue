<script setup lang="ts">
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, ref, watch } from 'vue';

import { loadAppInfo } from '../../lib/app-info';
import { clearUpdateStatus, loadUpdateStatus, updateStatus } from '../../lib/update-status';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const year = new Date().getFullYear();
const version = ref<string | null>(null);

// The backend version comes from the public version endpoint (Slice 0). Shown
// in the footer per Notes/eunomia-plan.md, Slice 6. Shared with the browser
// title, which needs the environment from the same answer — one request.
onMounted(async () => {
  version.value = (await loadAppInfo())?.version ?? null;
});

/*
 * The update check is admin-only and authenticated, so it waits for /me to
 * report the permissions — watching instead of onMounted, because this footer
 * is already mounted while that request is still in flight. Any failure (no
 * permission, no network, GitHub unreachable) leaves the notice off: knowing
 * about a new release is a convenience, never something to complain about.
 *
 * The answer itself lives in lib/update-status.ts, shared with the update card
 * in the system settings: a check triggered there reaches this footer at once,
 * instead of leaving it on the state of this page load (issues.md 0.13.0-6).
 */
watch(
  () => auth.isAdmin,
  async (isAdmin, wasAdmin) => {
    if (!isAdmin) {
      // Signed out: what that session learned must not outlive it in this tab.
      if (wasAdmin) clearUpdateStatus();
      return;
    }
    try {
      await loadUpdateStatus();
    } catch {
      // Silent on purpose — see above.
    }
  },
  { immediate: true },
);

const availableUpdate = computed(() => {
  const status = updateStatus.value;
  if (!status || status.status !== 'ok' || !status.updateAvailable) return null;
  if (!status.latest || !status.releaseUrl) return null;
  return { version: status.latest, url: status.releaseUrl };
});
</script>

<template>
  <footer class="eu-footer">
    <span>&copy; {{ year }} Max Zöller</span>
    <span v-if="version" class="eu-footer__version">
      Backend v{{ version }}
      <template v-if="availableUpdate">
        <span aria-hidden="true">·</span>
        <a
          class="eu-footer__update"
          :href="availableUpdate.url"
          target="_blank"
          rel="noopener"
          :aria-label="`Version ${availableUpdate.version} ist verfügbar — Release-Notes öffnen (neuer Tab)`"
        >
          <FontAwesomeIcon :icon="faArrowUp" aria-hidden="true" />
          v{{ availableUpdate.version }} verfügbar
        </a>
      </template>
    </span>
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

/* Brighter than the muted footer text: this one is a link and has to carry
   AA contrast on the brand-blue page background by itself. */
.eu-footer__update {
  color: var(--eu-color-text-inverse);
  white-space: nowrap;
}

/* Same as the sidebar — the default ring colour is tuned for the white card,
   not for the blue page this footer sits on. */
.eu-footer :focus-visible {
  outline-color: var(--eu-color-focus-ring-on-brand);
}
</style>
