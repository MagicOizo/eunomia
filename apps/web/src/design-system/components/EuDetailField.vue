<script setup lang="ts">
import { faArrowRotateLeft, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { pastedIsoDate } from '../../lib/date-input';
import { germanDate, germanMoney } from '../../lib/format';
import { detailMaskReadonly } from './detail-mask';
import EuCurrencyField from './EuCurrencyField.vue';
import EuEntityPicker, { type PickerOption } from './EuEntityPicker.vue';
import EuToggle from './EuToggle.vue';

export type DetailType =
  'text' | 'email' | 'number' | 'date' | 'currency' | 'select' | 'toggle' | 'readonly';
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
    /** For `number`: the input's granularity, e.g. '1' for whole kilometres. */
    step?: string;
    /** For `select`: offers ad-hoc create — the parent answers `create` with a create dialog. */
    allowCreate?: boolean;
    /** Noun of the created entity, e.g. "Leistungserbringer"; "Eintrag" when left out. */
    createNoun?: string;
  }>(),
  {
    type: 'text',
    modelValue: null,
    savedValue: undefined,
    required: false,
    disabled: false,
    options: () => [],
    step: undefined,
    allowCreate: false,
    createNoun: undefined,
  },
);

const { t } = useI18n();

const emit = defineEmits<{
  'update:modelValue': [value: DetailValue];
  /** Ad-hoc create asked for, with the text typed into the picker so far. */
  create: [query: string];
}>();

/**
 * What the row actually renders: its own type, or `readonly` throughout when
 * the surrounding mask is read-only (see detail-mask.ts). Everything below
 * reads this instead of `props.type`, so a read-only mask has no editor and no
 * action anywhere in it.
 */
const maskReadonly = inject(detailMaskReadonly, undefined);
const shownType = computed<DetailType>(() =>
  (maskReadonly?.value ?? false) ? 'readonly' : props.type,
);

/**
 * The text a readonly row shows. Without its editor a value has to say itself
 * what the editor said for it: a relation holds a UID, which means nothing to a
 * reader, and a date or an amount is stored the way the API carries it, not the
 * way this country writes it.
 */
const readonlyText = computed<string>(() => {
  const value = props.modelValue;
  if (value === null || value === undefined || value === '') return '–';
  switch (props.type) {
    case 'select':
      return props.options.find((option) => option.value === value)?.label ?? String(value);
    case 'toggle':
      return value ? t('common.yes') : t('common.no');
    case 'date':
      return germanDate(value);
    case 'currency':
      return germanMoney(value);
    default:
      return String(value);
  }
});

const addLabel = computed(() =>
  t('common.addNoun', { noun: props.createNoun ?? t('common.entry') }),
);

// What the picker currently has typed in it: the add action sits outside the
// field (the mask puts actions in their own column), so it needs to be told.
const query = ref('');

const isEmpty = computed(
  () => props.modelValue === null || props.modelValue === undefined || props.modelValue === '',
);
const clearable = computed(() => shownType.value !== 'toggle' && shownType.value !== 'readonly');
const canReset = computed(
  () =>
    shownType.value !== 'readonly' &&
    props.savedValue !== undefined &&
    props.modelValue !== props.savedValue,
);
// Narrowed per editor type. The casts live here because in a template binding
// the `|` of a union type is flagged as a Vue 2 filter.
const numberValue = computed(() => props.modelValue as number | null);
const stringValue = computed(() => props.modelValue as string | null);
const booleanValue = computed(() => props.modelValue as boolean);

/** Types whose empty value is `null` rather than an empty string. */
const nullWhenEmpty = (type: DetailType): boolean =>
  type === 'number' || type === 'currency' || type === 'select';

function onText(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value === '' ? '' : value);
}

/** A German date pasted into a date row (see lib/date-input.ts). */
function onPaste(event: ClipboardEvent): void {
  if (props.type !== 'date') return;
  const iso = pastedIsoDate(event);
  if (iso === null) return;
  event.preventDefault();
  emit('update:modelValue', iso);
}

function onNumber(event: Event): void {
  // A number input reports invalid content as an empty string, so anything
  // that is not empty parses cleanly here.
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value === '' ? null : Number(value));
}
function clear(): void {
  emit('update:modelValue', nullWhenEmpty(props.type) ? null : '');
}
function reset(): void {
  emit('update:modelValue', props.savedValue ?? null);
}
</script>

<template>
  <div class="eu-detail">
    <span class="eu-detail__label" :class="{ 'is-off': disabled }">{{ label }}</span>

    <div class="eu-detail__value" :class="{ 'is-off': disabled }">
      <!-- `after` puts something beside the field itself (the GiroCode next to
           the chosen bank account), without replacing it the way `value` does. -->
      <slot name="value">
        <span v-if="shownType === 'readonly'" class="eu-detail__readonly">
          {{ readonlyText }}
        </span>
        <input
          v-else-if="shownType === 'text' || shownType === 'email' || shownType === 'date'"
          class="eu-detail__input"
          :type="shownType === 'text' ? 'text' : shownType"
          autocomplete="off"
          :value="modelValue ?? ''"
          :aria-label="label"
          :disabled="disabled"
          placeholder="–"
          @input="onText"
          @paste="onPaste"
        />
        <input
          v-else-if="shownType === 'number'"
          class="eu-detail__input"
          type="number"
          inputmode="numeric"
          autocomplete="off"
          :step="step"
          :value="modelValue ?? ''"
          :aria-label="label"
          :disabled="disabled"
          placeholder="–"
          @input="onNumber"
        />
        <EuCurrencyField
          v-else-if="shownType === 'currency'"
          bare
          :label="label"
          :model-value="numberValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
        <EuEntityPicker
          v-else-if="shownType === 'select'"
          bare
          :label="label"
          :required="required"
          :disabled="disabled"
          :options="options"
          :model-value="stringValue"
          :allow-create="allowCreate"
          :create-noun="createNoun"
          @update:model-value="emit('update:modelValue', $event)"
          @update:query="query = $event"
          @create="emit('create', $event)"
        />
        <EuToggle
          v-else-if="shownType === 'toggle'"
          bare
          :label="label"
          :model-value="booleanValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </slot>
      <slot name="after" />
    </div>

    <div class="eu-detail__actions">
      <template v-if="shownType !== 'readonly'">
        <!-- Add, clear, reset — the icon order dialog-design.md fixes. In the
             mask the actions live in this column, not inside the field. -->
        <button
          v-if="shownType === 'select' && allowCreate"
          type="button"
          class="eu-detail__action"
          :disabled="disabled"
          :aria-label="addLabel"
          :title="addLabel"
          @click="emit('create', query.trim())"
        >
          <FontAwesomeIcon :icon="faPlus" aria-hidden="true" />
        </button>
        <button
          v-if="clearable"
          type="button"
          class="eu-detail__action"
          :disabled="required || isEmpty || disabled"
          :aria-label="t('common.clearValue')"
          :title="t('common.clearValue')"
          @click="clear"
        >
          <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="eu-detail__action"
          :disabled="!canReset || disabled"
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
/* The row dissolves into the parent grid so Label | value | actions align
   across all rows. */
.eu-detail {
  display: contents;
}

.eu-detail__label {
  color: var(--eu-color-text-muted);
  white-space: nowrap;
}

.eu-detail__label::after {
  content: ':';
}

.eu-detail__value {
  min-width: 0;
  /* A row plus what `after` adds to it; the field takes the space that is left
     and the addition never shrinks. */
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.eu-detail__value > :first-child {
  min-width: 0;
  flex: 1;
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
}

/* An empty field is invisible without this — the dash says a value can go
   here, and it only shows while the field is empty. */
.eu-detail__input::placeholder {
  color: var(--eu-color-text-muted);
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

/*
 * Narrow screens (see EuDetailMask): the label sits on its own line above its
 * value, and closer to it than to the row above — the spacing rule
 * dialog-design.md gives for the create form, which is what this layout turns
 * into. The value keeps column 1, the actions column 2.
 */
@media (max-width: 34rem) {
  .eu-detail__label {
    grid-column: 1 / -1;
    margin-top: 0.7rem;
    font-size: 0.85rem;
  }

  .eu-detail__value {
    padding-bottom: 0.15rem;
  }
}
</style>
