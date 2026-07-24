<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    icon?: IconDefinition;
    iconOnly?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    /** Required when iconOnly is true — otherwise screen reader users get an unlabeled button. */
    ariaLabel?: string;
  }>(),
  {
    variant: 'primary',
    icon: undefined,
    iconOnly: false,
    disabled: false,
    type: 'button',
    ariaLabel: undefined,
  },
);

if (import.meta.env.DEV && props.iconOnly && !props.ariaLabel) {
  console.warn('[EuButton] icon-only buttons must set an ariaLabel for screen reader users.');
}

const classes = computed(() => [
  'eu-button',
  `eu-button--${props.variant}`,
  { 'eu-button--icon-only': props.iconOnly },
]);
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled"
    :aria-label="iconOnly ? ariaLabel : undefined"
  >
    <FontAwesomeIcon v-if="icon" :icon="icon" aria-hidden="true" />
    <span v-if="!iconOnly"><slot /></span>
  </button>
</template>

<style scoped>
.eu-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  font-family: var(--eu-font-body);
  font-size: 1rem;
  padding: 0.5em 1.25em;
  border-radius: 0.375em;
  border: 2px solid transparent;
  cursor: pointer;
}

.eu-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.eu-button--primary {
  background-color: var(--eu-color-accent);
  color: var(--eu-color-text-inverse);
}

.eu-button--secondary {
  background-color: transparent;
  color: var(--eu-color-accent);
  border-color: var(--eu-color-accent);
}

/* Low-emphasis icon actions (e.g. a popover/dialog close): muted by default,
   accent on hover/focus — never competes with the content. */
.eu-button--ghost {
  background-color: transparent;
  color: var(--eu-color-text-muted);
}

.eu-button--ghost:hover:not(:disabled),
.eu-button--ghost:focus-visible {
  color: var(--eu-color-accent);
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-button--icon-only {
  padding: 0.5em;
  aspect-ratio: 1;
  justify-content: center;
}
</style>
