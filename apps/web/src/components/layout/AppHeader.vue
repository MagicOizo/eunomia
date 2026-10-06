<script setup lang="ts">
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useI18n } from 'vue-i18n';

defineProps<{ title: string }>();
const emit = defineEmits<{ toggleSidebar: [] }>();
const { t } = useI18n();
</script>

<template>
  <header class="eu-header">
    <button
      type="button"
      class="eu-header__toggle"
      :aria-label="t('layout.toggleNavigation')"
      @click="emit('toggleSidebar')"
    >
      <FontAwesomeIcon :icon="faBars" aria-hidden="true" />
    </button>
    <h1 class="eu-header__title">{{ title }}</h1>
  </header>
</template>

<style scoped>
.eu-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-header__title {
  margin: 0;
  font-size: 1.4rem;
  color: var(--eu-color-text);
}

.eu-header__toggle {
  display: none;
  border: none;
  background: none;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  color: var(--eu-color-text);
  cursor: pointer;
  font-size: 1.1rem;
}

.eu-header__toggle:hover {
  background-color: var(--eu-color-border);
}

@media (max-width: 48rem) {
  .eu-header__toggle {
    display: inline-flex;
  }
}
</style>
