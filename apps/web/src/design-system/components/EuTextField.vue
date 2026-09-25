<script setup lang="ts">
import { computed, useId } from 'vue';

import { pastedIsoDate } from '../../lib/date-input';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    error?: string;
    type?: string;
  }>(),
  { error: undefined, type: 'text' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const inputId = useId();
const errorId = useId();
const hasError = computed(() => Boolean(props.error));

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
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
      :value="modelValue"
      :aria-invalid="hasError || undefined"
      :aria-describedby="hasError ? errorId : undefined"
      @input="onInput"
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
