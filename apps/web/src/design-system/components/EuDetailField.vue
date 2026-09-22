<script setup lang="ts">
import { faArrowRotateLeft, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';

import EuCurrencyField from './EuCurrencyField.vue';
import EuEntityPicker, { type PickerOption } from './EuEntityPicker.vue';
import EuToggle from './EuToggle.vue';

export type DetailType = 'text' | 'date' | 'currency' | 'select' | 'toggle' | 'readonly';
export type DetailValue = string | number | boolean | null;

/**
 * One row of a view/edit "display mask" (see dialog-design.md): Label | value |
 * per-field actions. The value editor reads like plain text and only shows a
 * border on hover/focus. Clear (fa-xmark) is present but disabled on required
 * fields; Reset (fa-arrow-rotate-left) is enabled only when the value differs
 * from `savedValue`. Readonly/derived fields get no actions. Meant to sit in a
 * parent CSS grid (the row uses `display: contents`).
 */
const props = withDefaults(
  defineProps<{
    label: string;
    type?: DetailType;
    modelValue?: DetailValue;
    savedValue?: DetailValue;
    required?: boolean;
    disabled?: boolean;
    options?: PickerOption[];
  }>(),
  {
    type: 'text',
    modelValue: null,
    savedValue: undefined,
    required: false,
    disabled: false,
    options: () => [],
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: DetailValue] }>();

const isEmpty = computed(
  () => props.modelValue === null || props.modelValue === undefined || props.modelValue === '',
);
const clearable = computed(
  () =>
    props.type === 'text' ||
    props.type === 'date' ||
    props.type === 'currency' ||
    props.type === 'select',
);
const canReset = computed(
  () =>
    props.type !== 'readonly' &&
    props.savedValue !== undefined &&
    props.modelValue !== props.savedValue,
);
// Narrowed per editor type. The casts live here because in a template binding
// the `|` of a union type is flagged as a Vue 2 filter.
const numberValue = computed(() => props.modelValue as number | null);
const stringValue = computed(() => props.modelValue as string | null);
const booleanValue = computed(() => props.modelValue as boolean);

function onText(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value === '' ? '' : value);
}
function clear(): void {
  emit('update:modelValue', props.type === 'currency' || props.type === 'select' ? null : '');
}
function reset(): void {
  emit('update:modelValue', props.savedValue ?? null);
}
</script>

<template>
  <div class="eu-detail">
    <span class="eu-detail__label" :class="{ 'is-off': disabled }">{{ label }}</span>

    <div class="eu-detail__value" :class="{ 'is-off': disabled }">
      <slot name="value">
        <span v-if="type === 'readonly'" class="eu-detail__readonly">
          {{ modelValue === null || modelValue === '' ? '–' : modelValue }}
        </span>
        <input
          v-else-if="type === 'text' || type === 'date'"
          class="eu-detail__input"
          :type="type === 'date' ? 'date' : 'text'"
          :value="modelValue ?? ''"
          :aria-label="label"
          :disabled="disabled"
          @input="onText"
        />
        <EuCurrencyField
          v-else-if="type === 'currency'"
          bare
          :label="label"
          :model-value="numberValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <EuEntityPicker
          v-else-if="type === 'select'"
          bare
          :label="label"
          :required="required"
          :disabled="disabled"
          :options="options"
          :model-value="stringValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <EuToggle
          v-else-if="type === 'toggle'"
          label=""
          :model-value="booleanValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </slot>
    </div>

    <div class="eu-detail__actions">
      <template v-if="type !== 'readonly'">
        <button
          v-if="clearable"
          type="button"
          class="eu-detail__action"
          :disabled="required || isEmpty || disabled"
          aria-label="Wert löschen"
          title="Wert löschen"
          @click="clear"
        >
          <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="eu-detail__action"
          :disabled="!canReset || disabled"
          aria-label="Zurücksetzen"
          title="Auf gespeicherten Wert zurücksetzen"
          @click="reset"
        >
          <FontAwesomeIcon :icon="faArrowRotateLeft" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The row dissolves into the parent grid so Label | value | actions align
   across all rows. */
.eu-detail {
  display: contents;
}

.eu-detail__label {
  color: var(--eu-color-text-muted);
  white-space: nowrap;
}

.eu-detail__value {
  min-width: 0;
}

/* Disabled (e.g. gated off by another field): greyed and clearly inactive. */
.eu-detail__label.is-off,
.eu-detail__value.is-off {
  opacity: 0.5;
}

.eu-detail__input:disabled {
  cursor: not-allowed;
}

.eu-detail__readonly {
  padding: 0.2em 0.4em;
}

/* Display-mask input: no border at rest, revealed on hover/focus. */
.eu-detail__input {
  width: 100%;
  font: inherit;
  color: var(--eu-color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.25em;
  padding: 0.2em 0.4em;
}

.eu-detail__input:hover {
  border-color: var(--eu-color-border);
}

.eu-detail__input:focus {
  border-color: var(--eu-color-accent);
  outline: none;
}

.eu-detail__actions {
  display: inline-flex;
  gap: 0.15rem;
  justify-content: flex-end;
}

.eu-detail__action {
  display: inline-flex;
  border: none;
  background: none;
  padding: 0.25rem 0.35rem;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--eu-color-text-muted);
}

.eu-detail__action:hover:not(:disabled) {
  color: var(--eu-color-accent-text);
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-detail__action:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
