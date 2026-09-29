<script setup lang="ts">
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue';
import { faMagnifyingGlass, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
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
 * shows its label. In-field actions, in the order the design fixes them
 * (Notes/dialog-design.md): search, add, clear. Filtering is client-side over
 * `options`; `allowSearch` is for lists that outgrow that — the parent opens a
 * filter dialog and sets the value it finds.
 *
 * The list opens on a click, on typing and on ArrowDown — **not** on focus
 * alone: a picker that is merely tabbed through, or focused again on the way
 * back from a subdialog, would otherwise drop a full-height list over the
 * dialog footer. `focused` therefore tracks "shows its search text" separately
 * from `open` ("shows its list"), and a `null` highlight means the user has
 * not chosen anything yet, so Tab and Enter know to leave the value alone.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    label: string;
    options: PickerOption[];
    required?: boolean;
    disabled?: boolean;
    allowCreate?: boolean;
    /** Shows the search action; the parent answers `search` with a filter dialog. */
    allowSearch?: boolean;
    /** Display-mask mode: no visible label, border only on hover/focus. */
    bare?: boolean;
    /** Noun used in the "‹query› hinzufügen" row, e.g. "Leistungserbringer". */
    createNoun?: string;
  }>(),
  {
    required: false,
    disabled: false,
    allowCreate: false,
    allowSearch: false,
    bare: false,
    createNoun: 'Eintrag',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  /** The typed text, for a parent that renders the add action itself (the display mask). */
  'update:query': [value: string];
  create: [query: string];
  search: [query: string];
}>();

const inputId = useId();
const referenceRef = useTemplateRef<HTMLElement>('reference');
const floatingRef = useTemplateRef<HTMLElement>('floating');
const inputRef = useTemplateRef<HTMLInputElement>('input');

const listId = useId();
const open = ref(false);
/** Focused: the input shows the (editable) search text instead of the label. */
const focused = ref(false);
const query = ref('');
/** Index of the active item, `null` while the user has not chosen one. */
const highlight = ref<number | null>(null);

/** Single writer for the typed text, so the parent hears every change of it. */
function setQuery(value: string): void {
  query.value = value;
  emit('update:query', value);
}

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
      padding: 8,
      apply({ rects, elements, availableWidth }) {
        // The field gives the minimum, the room left gives the maximum: an
        // entry as long as an IBAN makes the list wider instead of scrolling
        // sideways in it — a scrollbar that cannot even be grabbed, since the
        // mousedown on it blurs the input and closes the list.
        elements.floating.style.minWidth = `${rects.reference.width}px`;
        elements.floating.style.maxWidth = `${Math.max(rects.reference.width, availableWidth)}px`;
      },
    }),
  ],
  whileElementsMounted: autoUpdate,
});

/**
 * The form both sides of the search are compared in: lower case and without
 * whitespace. A label printed in groups (an IBAN) is thereby found by the
 * number typed in one go, and the other way round. It only ever matches more
 * than the plain comparison did, never less.
 */
function searchable(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

const normalizedQuery = computed(() => searchable(query.value));

const filtered = computed(() => {
  const q = normalizedQuery.value;
  if (q === '') return props.options;
  return props.options.filter(
    (o) =>
      searchable(o.label).includes(q) || (o.hint !== undefined && searchable(o.hint).includes(q)),
  );
});

const showCreate = computed(
  () =>
    props.allowCreate &&
    query.value.trim() !== '' &&
    !props.options.some((o) => searchable(o.label) === normalizedQuery.value),
);

const itemCount = computed(() => (showCreate.value ? 1 : 0) + filtered.value.length);
const displayValue = computed(() => (focused.value ? query.value : (selected.value?.label ?? '')));

/** The option under the highlight, or null on the create row / no highlight. */
const activeOption = computed(() => {
  if (!open.value || highlight.value === null) return null;
  if (showCreate.value && highlight.value === 0) return null;
  return filtered.value[showCreate.value ? highlight.value - 1 : highlight.value] ?? null;
});

const activeId = computed(() => {
  if (!open.value || highlight.value === null) return undefined;
  return `${listId}-${highlight.value}`;
});

/** Takes the value without touching the focus — Tab needs to move on itself. */
function commit(option: PickerOption): void {
  emit('update:modelValue', option.value);
  setQuery('');
  open.value = false;
}

function select(option: PickerOption): void {
  commit(option);
  inputRef.value?.blur();
}

function clear(): void {
  if (props.required) return;
  emit('update:modelValue', null);
  setQuery('');
  inputRef.value?.focus();
}

function triggerCreate(): void {
  emit('create', query.value.trim());
  open.value = false;
}

function triggerSearch(): void {
  emit('search', query.value.trim());
  open.value = false;
}

function onFocus(): void {
  focused.value = true;
  // A fresh search every time the field is entered: the text typed last time
  // would otherwise come back as a filter nobody asked for.
  setQuery('');
  highlight.value = null;
}

function onBlur(): void {
  focused.value = false;
  open.value = false;
  // `query` survives on purpose — the mask renders its add action outside the
  // picker, so it is read after the click has taken the focus away.
}

function onInput(event: Event): void {
  setQuery((event.target as HTMLInputElement).value);
  open.value = true;
  highlight.value = 0;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open.value) {
      open.value = true;
      highlight.value = 0;
      return;
    }
    highlight.value = Math.min((highlight.value ?? -1) + 1, itemCount.value - 1);
  } else if (event.key === 'ArrowUp') {
    if (!open.value || highlight.value === null) return;
    event.preventDefault();
    highlight.value = Math.max(highlight.value - 1, 0);
  } else if (event.key === 'Enter') {
    if (!open.value || highlight.value === null) return;
    event.preventDefault();
    if (showCreate.value && highlight.value === 0) {
      triggerCreate();
      return;
    }
    if (activeOption.value) select(activeOption.value);
  } else if (event.key === 'Tab') {
    // Takes the choice along instead of losing it, and lets the browser move
    // the focus on as usual. The create row is deliberately not triggered: a
    // subdialog springing open while tabbing past would be a surprise.
    if (activeOption.value) commit(activeOption.value);
    open.value = false;
  } else if (event.key === 'Escape') {
    // Only ours while the list is open. Otherwise Escape belongs to the dialog
    // as its close request — and while the list is open it does not, or
    // dismissing a suggestion list would throw the whole form away (the native
    // <dialog> closes on the key itself, so stopping it takes preventDefault).
    if (!open.value) return;
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    setQuery('');
  }
}
</script>

<template>
  <div ref="reference" class="eu-picker">
    <label v-if="!bare" :for="inputId" class="eu-picker__label">{{ label }}</label>
    <div
      class="eu-picker__control"
      :class="{ 'is-open': open, 'is-disabled': disabled, 'is-bare': bare }"
    >
      <input
        :id="inputId"
        ref="input"
        class="eu-picker__input"
        :value="displayValue"
        :placeholder="focused && selected ? selected.label : bare ? '–' : ''"
        :disabled="disabled"
        :aria-label="bare ? label : undefined"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="open ? listId : undefined"
        :aria-activedescendant="activeId"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @click="open = true"
        @keydown="onKeydown"
      />
      <!-- @mousedown.prevent on every action: without it the input's @blur
           closes the list (and steals the click) before it is handled. -->
      <button
        v-if="allowSearch && !disabled && !bare"
        type="button"
        class="eu-picker__action"
        :aria-label="`${label} suchen`"
        :title="`${label} suchen`"
        @mousedown.prevent
        @click="triggerSearch"
      >
        <FontAwesomeIcon :icon="faMagnifyingGlass" aria-hidden="true" />
      </button>
      <button
        v-if="allowCreate && !disabled && !bare"
        type="button"
        class="eu-picker__action"
        :aria-label="`${createNoun} hinzufügen`"
        :title="`${createNoun} hinzufügen`"
        @mousedown.prevent
        @click="triggerCreate"
      >
        <FontAwesomeIcon :icon="faPlus" aria-hidden="true" />
      </button>
      <button
        v-if="modelValue && !required && !disabled && !bare"
        type="button"
        class="eu-picker__action"
        aria-label="Auswahl entfernen"
        @mousedown.prevent
        @click="clear"
      >
        <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
      </button>
    </div>

    <ul
      v-if="open"
      :id="listId"
      ref="floating"
      class="eu-picker__list"
      :style="floatingStyles"
      role="listbox"
    >
      <li
        v-if="showCreate"
        :id="`${listId}-0`"
        class="eu-picker__option eu-picker__option--create"
        :class="{ 'is-active': highlight === 0 }"
        role="option"
        :aria-selected="highlight === 0"
        @mousedown.prevent
        @click="triggerCreate"
      >
        <FontAwesomeIcon :icon="faPlus" aria-hidden="true" />
        <span>„{{ query.trim() }}" als {{ createNoun }} hinzufügen</span>
      </li>
      <li
        v-for="(option, i) in filtered"
        :id="`${listId}-${showCreate ? i + 1 : i}`"
        :key="option.value"
        class="eu-picker__option"
        :class="{ 'is-active': highlight === (showCreate ? i + 1 : i) }"
        role="option"
        :aria-selected="highlight === (showCreate ? i + 1 : i)"
        @mousedown.prevent
        @click="select(option)"
      >
        <span class="eu-picker__opt-label">{{ option.label }}</span>
        <span v-if="option.hint" class="eu-picker__opt-hint">{{ option.hint }}</span>
      </li>
      <li
        v-if="filtered.length === 0 && !showCreate"
        class="eu-picker__empty"
        role="option"
        aria-disabled="true"
        :aria-selected="false"
      >
        Keine Treffer
      </li>
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

.eu-picker__control:has(:focus-visible) {
  outline: var(--eu-focus-ring-width) solid var(--eu-color-focus-ring);
  outline-offset: var(--eu-focus-ring-offset);
}

.eu-picker__control.is-disabled {
  opacity: 0.6;
}

/* Display-mask mode: no border at rest, revealed on hover/focus. */
.eu-picker__control.is-bare {
  border-color: transparent;
  padding: 0.2em 0.4em;
}

.eu-picker__control.is-bare:hover {
  border-color: var(--eu-color-border);
}

.eu-picker__control.is-bare.is-open,
.eu-picker__control.is-bare:focus-within {
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

/* The dash of the display mask (see the placeholder binding above). */
.eu-picker__input::placeholder {
  color: var(--eu-color-text-muted);
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
  color: var(--eu-color-accent-text);
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
  /* Where even the widest the list may become is not enough, the hint drops
     under the label and the label itself breaks — anything rather than a
     horizontal scrollbar. */
  flex-wrap: wrap;
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
  color: var(--eu-color-accent-text);
  gap: 0.5rem;
  justify-content: flex-start;
}

.eu-picker__opt-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.eu-picker__opt-hint {
  min-width: 0;
  overflow: hidden;
  color: var(--eu-color-text-muted);
  font-size: 0.85em;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.eu-picker__empty {
  padding: 0.4rem 0.6rem;
  color: var(--eu-color-text-muted);
}
</style>
