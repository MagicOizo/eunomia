<script setup lang="ts">
import { faArrowRotateLeft, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';

import { pastedIsoDate } from '../../lib/date-input';
import { formatDate } from '../../lib/format';
import { detailMaskReadonly } from './detail-mask';

/**
 * A display-mask row holding a *list* of dates — Label | the dates | actions,
 * with the same look as `EuDetailField` (see dialog-design.md): the inputs read
 * as plain text and only show a border on hover/focus, the actions live in the
 * third column.
 *
 * A sibling of `EuDetailField` rather than another `type` of it: that
 * component's `DetailValue` is a single `string | number | boolean | null`, and
 * every mask types its values record on it. Widening that for one row would
 * reach into the policy and agency masks as well.
 *
 * Like `EuDetailField` the row dissolves into the parent grid (`display:
 * contents`), so it lines up with the rows around it.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    /** The dates, as ISO strings; an empty entry is a row waiting to be filled. */
    modelValue: string[];
    /** The stored list, for the reset action. */
    savedValue?: string[];
    /** Wording of the add action, e.g. "Behandlungstag hinzufügen". */
    addLabel?: string;
    /** A quiet line under the list, e.g. the span the dates cover. */
    hint?: string | null;
  }>(),
  { savedValue: undefined, addLabel: undefined, hint: null },
);

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const { t } = useI18n();

const addText = computed(() => props.addLabel ?? t('components.detailDays.addEntry'));

/** Read-only throughout when the surrounding mask is (see detail-mask.ts). */
const maskReadonly = inject(detailMaskReadonly, undefined);
const readonly = computed(() => maskReadonly?.value ?? false);
/** The dates as one line of text, for the read-only row. */
const readonlyText = computed(() => {
  const days = props.modelValue.filter(Boolean).map(formatDate);
  return days.length === 0 ? '–' : days.join(', ');
});

const canReset = computed(
  () =>
    props.savedValue !== undefined &&
    (props.savedValue.length !== props.modelValue.length ||
      props.savedValue.some((day, index) => day !== props.modelValue[index])),
);

function replace(index: number, value: string): void {
  emit(
    'update:modelValue',
    props.modelValue.map((day, i) => (i === index ? value : day)),
  );
}

function onInput(index: number, event: Event): void {
  replace(index, (event.target as HTMLInputElement).value);
}

/** A German date pasted into one of the rows (see lib/date-input.ts). */
function onPaste(index: number, event: ClipboardEvent): void {
  const iso = pastedIsoDate(event);
  if (iso === null) return;
  event.preventDefault();
  replace(index, iso);
}

function add(): void {
  emit('update:modelValue', [...props.modelValue, '']);
}

function removeAt(index: number): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  );
}

function clear(): void {
  emit('update:modelValue', []);
}

function reset(): void {
  emit('update:modelValue', [...(props.savedValue ?? [])]);
}
</script>

<template>
  <div class="eu-detail-days">
    <span class="eu-detail-days__label">{{ label }}</span>

    <div class="eu-detail-days__value">
      <p v-if="readonly" class="eu-detail-days__empty">{{ readonlyText }}</p>
      <p v-else-if="modelValue.length === 0" class="eu-detail-days__empty">–</p>
      <div
        v-for="(day, index) in readonly ? [] : modelValue"
        :key="index"
        class="eu-detail-days__row"
      >
        <input
          class="eu-detail-days__input"
          type="date"
          autocomplete="off"
          :value="day"
          :aria-label="t('components.detailDays.entry', { label, index: index + 1 })"
          placeholder="–"
          @input="onInput(index, $event)"
          @paste="onPaste(index, $event)"
        />
        <button
          type="button"
          class="eu-detail-days__action"
          :aria-label="t('components.detailDays.removeEntry', { label, index: index + 1 })"
          :title="t('components.detailDays.removeEntry', { label, index: index + 1 })"
          @click="removeAt(index)"
        >
          <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
        </button>
      </div>
      <p v-if="hint" class="eu-detail-days__hint">{{ hint }}</p>
    </div>

    <div class="eu-detail-days__actions">
      <!-- Add, clear, reset — the icon order dialog-design.md fixes. -->
      <template v-if="!readonly">
        <button
          type="button"
          class="eu-detail-days__action"
          :aria-label="addText"
          :title="addText"
          @click="add"
        >
          <FontAwesomeIcon :icon="faPlus" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="eu-detail-days__action"
          :disabled="modelValue.length === 0"
          :aria-label="t('components.detailDays.clearAll')"
          :title="t('components.detailDays.clearAll')"
          @click="clear"
        >
          <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="eu-detail-days__action"
          :disabled="!canReset"
          :aria-label="t('common.reset')"
          :title="t('common.resetToSaved')"
          @click="reset"
        >
          <FontAwesomeIcon :icon="faArrowRotateLeft" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Dissolves into the parent grid, like every other row of the mask. */
.eu-detail-days {
  display: contents;
}

.eu-detail-days__label {
  color: var(--eu-color-text-muted);
  white-space: nowrap;
  /* The list is taller than one line; the label belongs at its top. */
  align-self: start;
  padding-top: 0.2em;
}

.eu-detail-days__label::after {
  content: ':';
}

.eu-detail-days__value {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* The row hugs its date: the remove action belongs to the day beside it, and
   stretched to the column's edge it would sit right next to the "clear all"
   of the actions column — two identical crosses meaning different things. */
.eu-detail-days__row {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  justify-content: flex-start;
}

.eu-detail-days__empty,
.eu-detail-days__hint {
  margin: 0;
  padding: 0.2em 0.4em;
  color: var(--eu-color-text-muted);
}

.eu-detail-days__hint {
  font-size: 0.85rem;
}

/* Display-mask input: no border at rest, revealed on hover/focus. */
.eu-detail-days__input {
  font: inherit;
  color: var(--eu-color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.25em;
  padding: 0.2em 0.4em;
}

.eu-detail-days__input:hover {
  border-color: var(--eu-color-border);
}

.eu-detail-days__input:focus {
  border-color: var(--eu-color-accent);
}

.eu-detail-days__actions {
  display: inline-flex;
  gap: 0.15rem;
  justify-content: flex-end;
  align-self: start;
}

.eu-detail-days__action {
  display: inline-flex;
  border: none;
  background: none;
  padding: 0.25rem 0.35rem;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--eu-color-text-muted);
}

.eu-detail-days__action:hover:not(:disabled) {
  color: var(--eu-color-accent-text);
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-detail-days__action:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Narrow screens: label above the list, as in EuDetailField/EuDetailMask. */
@media (max-width: 34rem) {
  .eu-detail-days__label {
    grid-column: 1 / -1;
    margin-top: 0.7rem;
    font-size: 0.85rem;
    padding-top: 0;
  }

  .eu-detail-days__value {
    padding-bottom: 0.15rem;
  }
}
</style>
