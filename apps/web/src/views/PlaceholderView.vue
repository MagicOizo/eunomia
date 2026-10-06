<script setup lang="ts">
import { faPersonDigging } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="eu-placeholder">
    <FontAwesomeIcon :icon="faPersonDigging" class="eu-placeholder__icon" aria-hidden="true" />
    <p>{{ t('layout.placeholder') }}</p>
  </div>
</template>

<style scoped>
.eu-placeholder {
  max-width: 32rem;
  margin: 3rem auto;
  text-align: center;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-placeholder__icon {
  font-size: 2.5rem;
  color: var(--eu-color-accent-soft);
  margin-bottom: 1rem;
}
</style>
