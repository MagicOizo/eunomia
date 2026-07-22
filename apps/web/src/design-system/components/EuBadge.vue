<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';

/**
 * Generic status badge. Always pairs color with text (the default slot) and
 * optionally an icon, so status is never conveyed by color alone — see
 * Notes/eunomia-plan.md, 2.7 (WCAG 1.4.1). Invoice-lifecycle labels
 * ("offen", "eingereicht", ...) are supplied by the caller, not hardcoded
 * here, since this component has no knowledge of the domain yet.
 */
const props = defineProps<{
  tone: 'open' | 'submitted' | 'billed' | 'done' | 'neutral';
  icon?: IconDefinition;
}>();

const classes = computed(() => ['eu-badge', `eu-badge--${props.tone}`]);
</script>

<template>
  <span :class="classes">
    <FontAwesomeIcon v-if="icon" :icon="icon" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.eu-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.2em 0.7em;
  border-radius: 999px;
  font-family: var(--eu-font-data);
  font-size: 0.875rem;
  font-weight: 600;
}

.eu-badge--open {
  background-color: var(--eu-color-status-open-bg);
  color: var(--eu-color-status-open-fg);
}

.eu-badge--submitted {
  background-color: var(--eu-color-status-submitted-bg);
  color: var(--eu-color-status-submitted-fg);
}

.eu-badge--billed {
  background-color: var(--eu-color-status-billed-bg);
  color: var(--eu-color-status-billed-fg);
}

.eu-badge--done {
  background-color: var(--eu-color-status-done-bg);
  color: var(--eu-color-status-done-fg);
}

.eu-badge--neutral {
  background-color: var(--eu-color-border);
  color: var(--eu-color-text);
}
</style>
