<script setup lang="ts">
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useId, useTemplateRef, watch } from 'vue';

import EuButton from './EuButton.vue';

/**
 * Wraps the native <dialog> element rather than reimplementing modal
 * semantics by hand: showModal()/close() give us focus trapping, Escape-to-
 * close, and top-layer stacking for free, all of which the first attempt's
 * hand-rolled `.modal-dialog` markup had to (and didn't fully) replicate —
 * see Notes/eunomia-plan.md, 2.7.
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog');
const titleId = useId();

watch(
  () => props.open,
  (isOpen) => {
    const dialog = dialogRef.value;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  },
  { immediate: true },
);
</script>

<template>
  <dialog
    ref="dialog"
    class="eu-dialog"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <header class="eu-dialog__header">
      <h2 :id="titleId" class="eu-dialog__title">{{ title }}</h2>
      <EuButton variant="ghost" icon-only :icon="faXmark" aria-label="Schließen" @click="emit('close')" />
    </header>
    <div class="eu-dialog__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="eu-dialog__footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
.eu-dialog {
  border: none;
  border-radius: 0.5em;
  padding: 0;
  color: var(--eu-color-text);
  background-color: var(--eu-color-surface-bg);
  max-width: min(32rem, calc(100vw - 2rem));
}

.eu-dialog::backdrop {
  background-color: rgb(0 0 0 / 0.5);
}

.eu-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  padding: 1em 1.25em;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-dialog__title {
  margin: 0;
  font-size: 1.125rem;
}

.eu-dialog__body {
  padding: 1.25em;
}

.eu-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75em;
  padding: 1em 1.25em;
  border-top: 1px solid var(--eu-color-border);
}
</style>
