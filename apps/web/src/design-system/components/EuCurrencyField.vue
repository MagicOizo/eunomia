<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';

/**
 * Currency input with German formatting. Displays "1.234,56 €" when idle and a
 * plain, comma-decimal value while editing; emits a numeric `modelValue`
 * (null when empty). Formatting happens on blur, not per keystroke, so the
 * caret never jumps.
 */
const props = withDefaults(
  defineProps<{ modelValue: number | null; label: string; error?: string; bare?: boolean }>(),
  { error: undefined, bare: false },
);

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const inputId = useId();
const errorId = useId();
const hasError = computed(() => Boolean(props.error));

const focused = ref(false);
const text = ref('');

/**
 * Bare (display-mask) mode: the input hugs its content instead of stretching,
 * so the € sits next to the amount and not at the far end of the column.
 * Tabular figures make every digit exactly one `ch`; a comma or dot is about
 * 0.4 of one (measured), so counting characters alone would leave a visible
 * hole in front of the €. The empty field keeps a clickable 4 `ch`.
 */
const bareWidth = computed(() => {
  if (!props.bare) return undefined;
  const chars = [...text.value].reduce((sum, c) => sum + (/\d/.test(c) ? 1 : 0.4), 0);
  return `${Math.max(4, chars + 0.2)}ch`;
});

const formatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatValue(value: number | null): string {
  return value === null ? '' : formatter.format(value);
}

/** Plain, editable form: comma decimal, no thousands separators. */
function editableValue(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

/** Parses German (or plain) input to a number rounded to cents, or null. */
function parse(input: string): number | null {
  let s = input.replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // comma = decimal, dots = thousands
  if (s === '' || s === '-') return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Reflect external value changes while the field is not being edited.
watch(
  () => props.modelValue,
  (value) => {
    if (!focused.value) text.value = formatValue(value);
  },
  { immediate: true },
);

function onFocus(): void {
  focused.value = true;
  text.value = editableValue(props.modelValue);
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', parse(text.value));
}

function onBlur(): void {
  focused.value = false;
  const value = parse(text.value);
  emit('update:modelValue', value);
  text.value = formatValue(value);
}
</script>

<template>
  <div class="eu-currency-field">
    <label v-if="!bare" :for="inputId" class="eu-currency-field__label">{{ label }}</label>
    <div class="eu-currency-field__control" :class="{ 'is-error': hasError, 'is-bare': bare }">
      <input
        :id="inputId"
        class="eu-currency-field__input"
        inputmode="decimal"
        :value="text"
        :aria-label="bare ? label : undefined"
        :aria-invalid="hasError || undefined"
        :aria-describedby="hasError ? errorId : undefined"
        :style="bare ? { width: bareWidth } : undefined"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      />
      <span class="eu-currency-field__suffix" aria-hidden="true">€</span>
    </div>
    <p v-if="hasError" :id="errorId" class="eu-currency-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.eu-currency-field {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-family: var(--eu-font-data);
}

.eu-currency-field__label {
  font-weight: 600;
  color: var(--eu-color-text);
}

.eu-currency-field__control {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.5em 0.75em;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375em;
  background-color: var(--eu-color-surface-bg);
}

.eu-currency-field__control:focus-within {
  border-color: var(--eu-color-accent);
}

.eu-currency-field__control:has(:focus-visible) {
  outline: var(--eu-focus-ring-width) solid var(--eu-color-focus-ring);
  outline-offset: var(--eu-focus-ring-offset);
}

.eu-currency-field__control.is-error {
  border-color: var(--eu-color-error-fg);
}

/* Display-mask mode: no border at rest, revealed on hover/focus. */
.eu-currency-field__control.is-bare {
  display: inline-flex;
  border-color: transparent;
  padding: 0.2em 0.4em;
  /* Reads as one value ("180,00 €"), so the € keeps a word space, not the
     field gap the bordered variant needs. */
  gap: 0.25em;
}

.eu-currency-field__control.is-bare:hover {
  border-color: var(--eu-color-border);
}

.eu-currency-field__control.is-bare:focus-within {
  border-color: var(--eu-color-accent);
}

.eu-currency-field__input {
  flex: 1;
  min-width: 0;
  text-align: right;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--eu-color-text);
  font-variant-numeric: tabular-nums;
}

.eu-currency-field__control.is-bare > .eu-currency-field__input {
  flex: 0 1 auto;
  text-align: left;
}

.eu-currency-field__input:focus {
  outline: none;
}

.eu-currency-field__suffix {
  color: var(--eu-color-text-muted);
}

.eu-currency-field__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.875rem;
}
</style>
