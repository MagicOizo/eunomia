<script setup lang="ts">
import { computed, useId } from 'vue';

import { pastedIsoDate } from '../../lib/date-input';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    error?: string;
    type?: string;
    /**
     * Off by default (issues.md 0.11.0 2): the browser's own suggestions and
     * prefills sit oddly in this design and get in the way of typing. The prop
     * is there for the one place they are wanted -- the login form, where the
     * password manager has to recognise the fields.
     */
    autocomplete?: string;
    /**
     * The canonical written form of this field's value, applied when the field
     * is left — for a value that has one printed shape and is stored in
     * another: an IBAN is typed in groups of four and stored as one number
     * (issues.md 0.15.0-1). Never while typing: re-grouping under the caret
     * would move it, and a field that fights the keyboard is worse than one
     * that waits.
     */
    normalize?: (value: string) => string;
  }>(),
  { error: undefined, type: 'text', autocomplete: 'off', normalize: undefined },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const inputId = useId();
const errorId = useId();
const hasError = computed(() => Boolean(props.error));

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

/**
 * Leaving the field writes the value in its canonical form — and only then: an
 * unchanged text emits nothing, so a field without a `normalize`, or one
 * already written correctly, stays as quiet as it was before.
 */
function onBlur(): void {
  if (!props.normalize) return;
  const normalized = props.normalize(props.modelValue);
  if (normalized !== props.modelValue) emit('update:modelValue', normalized);
}

/** A German date pasted into a date field (see lib/date-input.ts). */
function onPaste(event: ClipboardEvent): void {
  if (props.type !== 'date') return;
  const iso = pastedIsoDate(event);
  if (iso === null) return;
  event.preventDefault();
  emit('update:modelValue', iso);
}
</script>

<template>
  <div class="eu-text-field">
    <label :for="inputId" class="eu-text-field__label">{{ label }}</label>
    <input
      :id="inputId"
      class="eu-text-field__input"
      :type="type"
      :autocomplete="autocomplete"
      :value="modelValue"
      :aria-invalid="hasError || undefined"
      :aria-describedby="hasError ? errorId : undefined"
      @input="onInput"
      @blur="onBlur"
      @paste="onPaste"
    />
    <p v-if="hasError" :id="errorId" class="eu-text-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.eu-text-field {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-family: var(--eu-font-data);
}

.eu-text-field__label {
  font-weight: 600;
  color: var(--eu-color-text);
}

.eu-text-field__input {
  font: inherit;
  padding: 0.5em 0.75em;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375em;
  background-color: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
}

.eu-text-field__input[aria-invalid='true'] {
  border-color: var(--eu-color-error-fg);
}

.eu-text-field__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.875rem;
}
</style>
