<script setup lang="ts">
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useI18n } from 'vue-i18n';

/**
 * Security nudge shown to admins while the one-time setup endpoint is still
 * open (SETUP_TOKEN set). Not dismissible on purpose — it disappears by itself
 * once the token is removed and the next /me reports it inactive.
 */
const { t } = useI18n();
</script>

<template>
  <div class="eu-setup-warning" role="alert">
    <FontAwesomeIcon
      :icon="faTriangleExclamation"
      class="eu-setup-warning__icon"
      aria-hidden="true"
    />
    <div>
      <strong>{{ t('layout.setupToken.title') }}</strong>
      <i18n-t keypath="layout.setupToken.body" tag="p" scope="global">
        <template #endpoint><code>POST /api/v1/setup</code></template>
        <template #token><code>SETUP_TOKEN</code></template>
        <template #file><code>.env</code></template>
      </i18n-t>
    </div>
  </div>
</template>

<style scoped>
.eu-setup-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
  border: 1px solid var(--eu-color-status-submitted-fg);
  border-radius: 0.5rem;
  background-color: var(--eu-color-status-submitted-bg);
  color: var(--eu-color-status-submitted-fg);
}

.eu-setup-warning__icon {
  margin-top: 0.15rem;
  font-size: 1.1rem;
}

.eu-setup-warning strong {
  display: block;
}

.eu-setup-warning p {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.eu-setup-warning code {
  font-family: var(--eu-font-data);
  background-color: color-mix(in srgb, var(--eu-color-status-submitted-fg) 12%, transparent);
  padding: 0 0.25em;
  border-radius: 0.2em;
}
</style>
