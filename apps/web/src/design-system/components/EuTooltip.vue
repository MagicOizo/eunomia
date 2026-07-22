<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { ref, useId, useTemplateRef } from 'vue';

/**
 * Positioned with @floating-ui/vue instead of the first attempt's CSS
 * anchor-positioning (`position-anchor`/`position-area`), which is
 * Chromium-only — see Notes/eunomia-plan.md, 2.7. Shown on hover *and*
 * keyboard focus so keyboard-only users can reach the same information.
 */
const props = defineProps<{ text: string }>();

const referenceRef = useTemplateRef<HTMLElement>('reference');
const floatingRef = useTemplateRef<HTMLElement>('floating');
const isOpen = ref(false);
const tooltipId = useId();

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: 'top',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

function show(): void {
  isOpen.value = true;
}
function hide(): void {
  isOpen.value = false;
}
</script>

<template>
  <span
    ref="reference"
    class="eu-tooltip-trigger"
    tabindex="0"
    :aria-describedby="isOpen ? tooltipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <slot />
  </span>
  <div
    v-if="isOpen"
    :id="tooltipId"
    ref="floating"
    role="tooltip"
    class="eu-tooltip"
    :style="floatingStyles"
  >
    {{ props.text }}
  </div>
</template>

<style scoped>
.eu-tooltip-trigger {
  border-bottom: 1px dotted var(--eu-color-text-muted);
  cursor: help;
}

.eu-tooltip {
  background-color: var(--eu-color-text);
  color: var(--eu-color-surface-bg);
  padding: 0.35em 0.6em;
  border-radius: 0.25em;
  font-size: 0.8125rem;
  max-width: 16rem;
}
</style>
