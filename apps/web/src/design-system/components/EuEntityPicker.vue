<script setup lang="ts">
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue';
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, ref, useId, useTemplateRef } from 'vue';

export interface PickerOption {
  value: string;
  label: string;
  /** Secondary text shown to help identify the option (e.g. city, IBAN). */
  hint?: string;
}

/**
 * Typeahead picker for a related entity — replaces a plain dropdown so long,
 * growing lists stay searchable. Stores the option's UID as `modelValue` and
 * shows its label. Optional in-field actions: clear, and (when `allowCreate`)
 * an "add ‹query›" row that emits `create` so the parent can open a create
 * dialog. Filtering is client-side over `options`.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    label: string;
    options: PickerOption[];
    required?: boolean;
    allowCreate?: boolean;
    /** Noun used in the "‹query› hinzufügen" row, e.g. "Leistungserbringer". */
    createNoun?: string;
  }>(),
  { required: false, allowCreate: false, createNoun: 'Eintrag' },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  create: [query: string];
}>();

const inputId = useId();
const referenceRef = useTemplateRef<HTMLElement>('reference');
const floatingRef = useTemplateRef<HTMLElement>('floating');
const inputRef = useTemplateRef<HTMLInputElement>('input');

const open = ref(false);
const query = ref('');
const highlight = ref(0);

const selected = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null);

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  // fixed so the list escapes the dialog body's overflow (and its own clipping)
  // while still rendering inside the modal's top layer.
  strategy: 'fixed',
  placement: 'bottom-start',
  middleware: [
    offset(4),
    flip(),
    shift({ padding: 8 }),
    size({
      apply({ rects, elements }) {
        elements.floating.style.width = `${rects.reference.width}px`;
      },
    }),
  ],
  whileElementsMounted: autoUpdate,
});

const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const filtered = computed(() => {
  const q = normalizedQuery.value;
  if (q === '') return props.options;
  return props.options.filter(
    (o) => o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false),
  );
});

const showCreate = computed(
  () =>
    props.allowCreate &&
    query.value.trim() !== '' &&
    !props.options.some((o) => o.label.toLowerCase() === normalizedQuery.value),
);

const itemCount = computed(() => (showCreate.value ? 1 : 0) + filtered.value.length);
const displayValue = computed(() => (open.value ? query.value : (selected.value?.label ?? '')));

function select(option: PickerOption): void {
  emit('update:modelValue', option.value);
  query.value = '';
  open.value = false;
  inputRef.value?.blur();
}

function clear(): void {
  if (props.required) return;
  emit('update:modelValue', null);
  query.value = '';
  inputRef.value?.focus();
}

function triggerCreate(): void {
  emit('create', query.value.trim());
  open.value = false;
}

function onInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value;
  open.value = true;
  highlight.value = 0;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    open.value = true;
    highlight.value = Math.min(highlight.value + 1, itemCount.value - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    highlight.value = Math.max(highlight.value - 1, 0);
  } else if (event.key === 'Enter') {
    if (!open.value) return;
    event.preventDefault();
    if (showCreate.value && highlight.value === 0) {
      triggerCreate();
      return;
    }
    const option = filtered.value[showCreate.value ? highlight.value - 1 : highlight.value];
    if (option) select(option);
  } else if (event.key === 'Escape') {
    open.value = false;
    inputRef.value?.blur();
  }
}
</script>

<template>
  <div ref="reference" class="eu-picker">
    <label :for="inputId" class="eu-picker__label">{{ label }}</label>
    <div class="eu-picker__control" :class="{ 'is-open': open }">
      <input
        :id="inputId"
        ref="input"
        class="eu-picker__input"
        :value="displayValue"
        :placeholder="open && selected ? selected.label : ''"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        @input="onInput"
        @focus="open = true"
        @blur="open = false"
        @keydown="onKeydown"
      />
      <button
        v-if="modelValue && !required"
        type="button"
        class="eu-picker__action"
        aria-label="Auswahl entfernen"
        @mousedown.prevent
        @click="clear"
      >
        <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
      </button>
    </div>

    <ul v-if="open" ref="floating" class="eu-picker__list" :style="floatingStyles" role="listbox">
      <li
        v-if="showCreate"
        class="eu-picker__option eu-picker__option--create"
        :class="{ 'is-active': highlight === 0 }"
        @mousedown.prevent
        @click="triggerCreate"
      >
        <FontAwesomeIcon :icon="faPlus" aria-hidden="true" />
        <span>„{{ query.trim() }}" als {{ createNoun }} hinzufügen</span>
      </li>
      <li
        v-for="(option, i) in filtered"
        :key="option.value"
        class="eu-picker__option"
        :class="{ 'is-active': highlight === (showCreate ? i + 1 : i) }"
        @mousedown.prevent
        @click="select(option)"
      >
        <span class="eu-picker__opt-label">{{ option.label }}</span>
        <span v-if="option.hint" class="eu-picker__opt-hint">{{ option.hint }}</span>
      </li>
      <li v-if="filtered.length === 0 && !showCreate" class="eu-picker__empty">Keine Treffer</li>
    </ul>
  </div>
</template>

<style scoped>
.eu-picker {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-family: var(--eu-font-data);
}

.eu-picker__label {
  font-weight: 600;
  color: var(--eu-color-text);
}

.eu-picker__control {
  display: flex;
  align-items: center;
  gap: 0.25em;
  padding: 0.5em 0.5em 0.5em 0.75em;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375em;
  background-color: var(--eu-color-surface-bg);
}

.eu-picker__control.is-open,
.eu-picker__control:focus-within {
  border-color: var(--eu-color-accent);
}

.eu-picker__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--eu-color-text);
}

.eu-picker__input:focus {
  outline: none;
}

.eu-picker__action {
  display: inline-flex;
  border: none;
  background: none;
  padding: 0.15em 0.3em;
  cursor: pointer;
  color: var(--eu-color-text-muted);
  border-radius: 0.25em;
}

.eu-picker__action:hover {
  color: var(--eu-color-accent);
}

.eu-picker__list {
  z-index: 30;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  max-height: 15rem;
  overflow-y: auto;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375rem;
  background-color: var(--eu-color-surface-bg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
}

.eu-picker__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.25rem;
  cursor: pointer;
}

.eu-picker__option.is-active,
.eu-picker__option:hover {
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-picker__option--create {
  color: var(--eu-color-accent);
  gap: 0.5rem;
  justify-content: flex-start;
}

.eu-picker__opt-hint {
  color: var(--eu-color-text-muted);
  font-size: 0.85em;
  white-space: nowrap;
}

.eu-picker__empty {
  padding: 0.4rem 0.6rem;
  color: var(--eu-color-text-muted);
}
</style>
