<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';

import EuButton from './EuButton.vue';

/**
 * Click-triggered, anchored info bubble — the payment-info popover uses it to
 * surface details next to the row without a full modal. Positioned with
 * @floating-ui/vue like EuTooltip (CSS anchor positioning is Chromium-only,
 * see Notes/eunomia-plan.md 2.7). Dismisses on outside click and Escape.
 * The trigger goes in the `#trigger` slot, the bubble content in the default.
 */
const props = defineProps<{ title: string }>();

const referenceRef = useTemplateRef<HTMLElement>('reference');
const floatingRef = useTemplateRef<HTMLElement>('floating');
const isOpen = ref(false);
const panelId = useId();

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: 'bottom-start',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

function open(): void {
  isOpen.value = true;
}

function close(): void {
  isOpen.value = false;
}

function toggle(): void {
  if (isOpen.value) close();
  else open();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (referenceRef.value?.contains(target) || floatingRef.value?.contains(target)) return;
  close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

watch(isOpen, (nowOpen) => {
  if (nowOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <span
    ref="reference"
    class="eu-popover-trigger"
    :aria-expanded="isOpen"
    :aria-controls="isOpen ? panelId : undefined"
    @click="toggle"
  >
    <slot name="trigger" />
  </span>
  <div
    v-if="isOpen"
    :id="panelId"
    ref="floating"
    role="dialog"
    :aria-label="props.title"
    class="eu-popover"
    :style="floatingStyles"
  >
    <header class="eu-popover__header">
      <h3 class="eu-popover__title">{{ props.title }}</h3>
      <EuButton variant="ghost" icon-only :icon="faXmark" aria-label="Schließen" @click="close" />
    </header>
    <div class="eu-popover__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.eu-popover-trigger {
  display: inline-flex;
}

.eu-popover {
  z-index: 20;
  min-width: 15rem;
  max-width: min(22rem, calc(100vw - 2rem));
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  background-color: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
}

.eu-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 0.9rem;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-popover__title {
  margin: 0;
  font-size: 0.95rem;
}

.eu-popover__body {
  padding: 0.9rem;
}
</style>
