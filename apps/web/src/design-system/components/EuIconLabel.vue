<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

import EuTooltip from './EuTooltip.vue';

/**
 * An icon standing in for a written label, where space is too tight for the
 * word itself (e.g. the label column of the payment info). The label reaches
 * everyone: as a tooltip on hover and keyboard focus, and as text for screen
 * readers, which see the icon itself as decoration.
 *
 * Font Awesome's own `title` prop is deliberately not used — it renders
 * neither a tooltip nor an accessible name (the SVG stays `aria-hidden`).
 */
defineProps<{
  icon: IconDefinition;
  label: string;
  /** CSS color for the icon, e.g. to carry a status (the value stays textual). */
  color?: string;
}>();
</script>

<template>
  <EuTooltip plain :text="label">
    <FontAwesomeIcon :icon="icon" fixed-width aria-hidden="true" :style="color ? { color } : {}" />
    <span class="eu-icon-label__text">{{ label }}</span>
  </EuTooltip>
</template>

<style scoped>
/* Readable by screen readers, invisible on screen — and not `display: none`,
   which would take it out of the accessibility tree as well. */
.eu-icon-label__text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
