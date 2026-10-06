<script setup lang="ts">
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuTextField from './EuTextField.vue';

export interface DateSuggestion {
  /** The date it stands for, as ISO text — what the field is set to. */
  value: string;
  /** What the step is called ("14 Tage"). */
  label: string;
  /** The date it works out to, written out ("15.03.2020"). */
  hint?: string;
}

/**
 * A date field with a handful of dates suggested under it — for a date that is
 * usually one of a few steps from another date, and sometimes none of them: the
 * payment term of an invoice (issues.md 0.15.0-2). The field stays an ordinary
 * date input and remains the value; the list only fills it.
 *
 * Three things are deliberate, and all three differ from EuEntityPicker, whose
 * floating-list mechanics this otherwise follows:
 *
 * - It opens **on focus**. The picker deliberately does not, because its list is
 *   screen-high and would drop over the dialog footer of a form merely tabbed
 *   through; four suggested dates do not.
 * - The arrow keys in the field stay the browser's (they step day, month and
 *   year of a date input). The list is reached with Tab instead, as a single
 *   stop: only its active entry is tabbable, and the arrows move within it.
 *   That keeps the field's own keyboard intact and still leaves the suggestions
 *   two keystrokes away.
 * - After a pick (and after Escape) the list stays shut until the field is left
 *   or clicked again. Without that bolt it would spring open again the moment
 *   the focus returns to the field, which is precisely where a pick leaves it.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    /** The dates offered; none means no list at all. */
    suggestions: DateSuggestion[];
    /** The group's accessible name, e.g. "Typische Zahlungsziele". */
    suggestionsLabel?: string;
  }>(),
  { suggestionsLabel: undefined },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const listLabel = computed(
  () => props.suggestionsLabel ?? t('components.suggestedDate.suggestions'),
);

const referenceRef = useTemplateRef<HTMLElement>('reference');
const floatingRef = useTemplateRef<HTMLElement>('floating');

const open = ref(false);
/** Shut until the field is left or clicked again (see the note above). */
const suppressed = ref(false);
/** The entry the Tab stop points at; the arrows move it. */
const active = ref(0);

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  // fixed so the list escapes the dialog body's overflow, as in EuEntityPicker.
  strategy: 'fixed',
  placement: 'bottom-start',
  middleware: [
    offset(4),
    flip(),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, elements }) {
        elements.floating.style.minWidth = `${rects.reference.width}px`;
      },
    }),
  ],
  whileElementsMounted: autoUpdate,
});

/** The field's own input, for handing the focus back after a pick. */
function inputEl(): HTMLInputElement | null {
  return referenceRef.value?.querySelector('input') ?? null;
}

function optionButtons(): HTMLButtonElement[] {
  return [...(floatingRef.value?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
}

function openList(): void {
  if (suppressed.value || props.suggestions.length === 0) return;
  active.value = 0;
  open.value = true;
}

/** Closes the list; `bolt` keeps it closed while the field still has the focus. */
function close(bolt: boolean): void {
  open.value = false;
  if (bolt) suppressed.value = true;
}

/** The focus arriving in the field opens the list; arriving in the list does not. */
function onFocusin(event: FocusEvent): void {
  if (event.target === inputEl()) openList();
}

/** Only the focus leaving the whole field — moving into the list is not leaving. */
function onFocusout(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && referenceRef.value?.contains(next)) return;
  close(false);
  suppressed.value = false;
}

function onClick(): void {
  // A click is a request: it lifts the bolt a pick or an Escape set.
  suppressed.value = false;
  openList();
}

function pick(suggestion: DateSuggestion): void {
  emit('update:modelValue', suggestion.value);
  close(true);
  inputEl()?.focus();
}

/** Moves the Tab stop and the focus with it, so the arrows read as one list. */
async function moveTo(index: number): Promise<void> {
  const count = props.suggestions.length;
  active.value = ((index % count) + count) % count;
  await nextTick();
  optionButtons()[active.value]?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // Ours only while the list is open — otherwise Escape belongs to the dialog
    // as its close request, and the native <dialog> acts on the key itself, so
    // keeping the form open takes preventDefault as well (as in EuEntityPicker).
    if (!open.value) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
    inputEl()?.focus();
    return;
  }

  // Everything below is the list's; in the field itself the arrow keys step the
  // date, which is the browser's business.
  if (!open.value || event.target === inputEl()) return;

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      void moveTo(active.value + 1);
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      void moveTo(active.value - 1);
      break;
    case 'Home':
      event.preventDefault();
      void moveTo(0);
      break;
    case 'End':
      event.preventDefault();
      void moveTo(props.suggestions.length - 1);
      break;
  }
}

// A list standing open while its last suggestion disappears (the invoice date
// was cleared) would be an empty box over the form.
watch(
  () => props.suggestions.length,
  (count) => {
    if (count === 0) open.value = false;
    else if (active.value >= count) active.value = 0;
  },
);
</script>

<template>
  <div
    ref="reference"
    class="eu-date-suggest"
    @focusin="onFocusin"
    @focusout="onFocusout"
    @keydown="onKeydown"
  >
    <EuTextField
      :model-value="modelValue"
      :label="label"
      type="date"
      @update:model-value="emit('update:modelValue', $event)"
      @click="onClick"
    />
    <div
      v-if="open"
      ref="floating"
      class="eu-date-suggest__list"
      :style="floatingStyles"
      role="group"
      :aria-label="listLabel"
    >
      <!-- @mousedown.prevent: without it the click first takes the focus out of
           the field, and the list would be gone before the click is handled. -->
      <button
        v-for="(suggestion, index) in suggestions"
        :key="suggestion.value"
        type="button"
        class="eu-date-suggest__option"
        :tabindex="index === active ? 0 : -1"
        @mousedown.prevent
        @click="pick(suggestion)"
      >
        <span class="eu-date-suggest__label">{{ suggestion.label }}</span>
        <span v-if="suggestion.hint" class="eu-date-suggest__hint">{{ suggestion.hint }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.eu-date-suggest {
  display: flex;
  flex-direction: column;
}

/* Padded by the room a focus ring needs: the ring of the first and last entry
   would otherwise sit flush with the box's edge. */
.eu-date-suggest__list {
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: var(--eu-focus-ring-space);
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375rem;
  background-color: var(--eu-color-surface-bg);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  font-family: var(--eu-font-data);
}

.eu-date-suggest__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: 0.25rem;
  background: none;
  font: inherit;
  color: var(--eu-color-text);
  text-align: left;
  cursor: pointer;
}

.eu-date-suggest__option:hover {
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-date-suggest__hint {
  color: var(--eu-color-text-muted);
  font-size: 0.85em;
  white-space: nowrap;
}
</style>
