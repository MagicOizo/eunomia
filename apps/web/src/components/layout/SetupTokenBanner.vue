<script setup lang="ts">
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

/**
 * Security nudge shown to admins while the one-time setup endpoint is still
 * open (SETUP_TOKEN set). Not dismissible on purpose — it disappears by itself
 * once the token is removed and the next /me reports it inactive.
 */
</script>

<template>
  <div class="eu-setup-warning" role="alert">
    <FontAwesomeIcon :icon="faTriangleExclamation" class="eu-setup-warning__icon" aria-hidden="true" />
    <div>
      <strong>Sicherheitshinweis: Das SETUP_TOKEN ist noch aktiv.</strong>
      <p>
        Der Ersteinrichtungs-Endpunkt (<code>POST /api/v1/setup</code>) ist dadurch weiterhin
        erreichbar. Entferne <code>SETUP_TOKEN</code> aus der <code>.env</code> und starte die
        Anwendung neu, um ihn zu deaktivieren.
      </p>
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
