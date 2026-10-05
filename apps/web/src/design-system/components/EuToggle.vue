<script setup lang="ts">
import { useId } from 'vue';

/**
 * A slider-style boolean toggle (nicer than a bare checkbox for on/off flags).
 * `bare` is for the display mask, which prints the label in its own column: the
 * text is dropped here but stays as the accessible name, so the screen reader
 * does not meet a nameless checkbox. `disabled` shows a value that is not the
 * user's to change here — it still reads out, it just cannot be flipped.
 */
withDefaults(
  defineProps<{ modelValue: boolean; label: string; bare?: boolean; disabled?: boolean }>(),
  { bare: false, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const inputId = useId();
</script>

<template>
  <label :for="inputId" class="eu-toggle" :class="{ 'is-disabled': disabled }">
    <input
      :id="inputId"
      type="checkbox"
      class="eu-toggle__input"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="bare ? label : undefined"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="eu-toggle__track" aria-hidden="true"><span class="eu-toggle__thumb" /></span>
    <span v-if="!bare" class="eu-toggle__label">{{ label }}</span>
  </label>
</template>

<style scoped>
/* Positioned so that it, and not something far above it, is the containing
   block of the absolutely positioned input below (issues.md 0.12.0 1). Without
   it the nearest positioned ancestor is the `<dialog>` itself, which Chromium
   gives `position: fixed`. The input then takes its static position -- deep
   inside the scrolled `.eu-dialog__body` -- but measured from the dialog, so it
   lands past the dialog's bottom edge: measured 1212px in a dialog 810px tall.
   Two things followed from that. The dialog grew scrollable itself (a second
   scrollbar, and empty space below the footer), and clicking the label focused
   the hidden input, whereupon Chromium scrolled it into view and pushed the
   dialog down by 402px, taking the header off screen. */
.eu-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--eu-font-data);
  cursor: pointer;
}

/* The same dimming a disabled button gets. */
.eu-toggle.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Visually hidden but still focusable/announced. */
.eu-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.eu-toggle__track {
  position: relative;
  display: inline-block;
  width: 2.4rem;
  height: 1.35rem;
  border-radius: 999px;
  background-color: var(--eu-color-border);
  transition: background-color 0.15s ease;
  flex-shrink: 0;
}

.eu-toggle__thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 50%;
  background-color: var(--eu-color-surface-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 35%);
  transition: transform 0.15s ease;
}

.eu-toggle__input:checked + .eu-toggle__track {
  background-color: var(--eu-color-accent);
}

.eu-toggle__input:checked + .eu-toggle__track .eu-toggle__thumb {
  transform: translateX(1.05rem);
}

.eu-toggle__input:focus-visible + .eu-toggle__track {
  outline: 3px solid var(--eu-color-focus-ring);
  outline-offset: 2px;
}
</style>
