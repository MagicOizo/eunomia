<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../../design-system/components/EuButton.vue';
import type { DetailType, DetailValue } from '../../design-system/components/EuDetailField.vue';
import EuDetailField from '../../design-system/components/EuDetailField.vue';
import EuDetailMask from '../../design-system/components/EuDetailMask.vue';
import EuDialog from '../../design-system/components/EuDialog.vue';
import { useFormDialog, type FormDialogProps } from '../../lib/form-dialog';
import type { ResourceRow } from '../../lib/resource';
import type { FieldConfig } from '../../resources/config';
import { type SelectOption } from './EuSelectField.vue';

/**
 * View/edit a master-data row as the three-column display mask of
 * dialog-design.md — Label | value | clear/reset — driven by the same
 * `ResourceConfig.fields` that build the create form. Creating stays the
 * classic form (ResourceFormDialog), and a resource with a mask of its own
 * (invoice, policy) brings its own dialog. Like the form, this dialog only
 * collects values; ResourceView owns the request.
 */
const props = defineProps<
  FormDialogProps & {
    title: string;
    fields: FieldConfig[];
    /** Select options keyed by lookup name (see ResourceConfig.lookups). */
    options: Record<string, SelectOption[]>;
    /** The row being edited. */
    editing: ResourceRow | null;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: Record<string, unknown>] }>();

const values = ref<Record<string, DetailValue>>({});
const saved = ref<Record<string, DetailValue>>({});

/** Empty means `null` for pickers and numbers, an empty string for text inputs. */
const holdsNull = (field: FieldConfig): boolean =>
  field.type === 'number' || field.type === 'currency' || field.type === 'select';

function seedValue(field: FieldConfig, raw: unknown): DetailValue {
  if (raw === null || raw === undefined) return holdsNull(field) ? null : '';
  if (field.type === 'number' || field.type === 'currency') return Number(raw);
  return String(raw);
}

/** Immutable fields are derived/fixed, so they show as readonly rows without actions. */
function typeOf(field: FieldConfig): DetailType {
  return field.immutable ? 'readonly' : field.type;
}

function optionsFor(field: FieldConfig): SelectOption[] {
  if (field.options) return field.options;
  return field.optionsFrom ? (props.options[field.optionsFrom] ?? []) : [];
}

/**
 * The value the row renders: the stored one, except for a readonly relation,
 * which shows the related record's label instead of its UID.
 */
function displayValue(field: FieldConfig): DetailValue {
  const value = values.value[field.key] ?? null;
  if (!field.immutable || field.type !== 'select' || value === null) return value;
  return optionsFor(field).find((option) => option.value === value)?.label ?? String(value);
}

// Seeded per opened row, so Reset always goes back to what the server holds.
// Rebuilt from `fields` too: ResourceView is reused across resources.
const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const row = props.editing;
    if (!row) return;
    const seed: Record<string, DetailValue> = {};
    for (const field of props.fields) seed[field.key] = seedValue(field, row[field.key]);
    values.value = seed;
    saved.value = { ...seed };
  },
  () => [props.editing, props.fields],
);

function submit(): void {
  clear();
  const payload: Record<string, unknown> = {};

  for (const field of props.fields) {
    if (field.immutable) continue;

    const value = values.value[field.key] ?? null;
    const text = typeof value === 'string' ? value.trim() : '';
    if (value === null || (typeof value === 'string' && text === '')) {
      if (field.required) return fail(`Bitte „${field.label}“ ausfüllen.`);
      // Sent explicitly: clearing a field has to reach the server, unlike in
      // the create form where an empty optional is simply left out.
      payload[field.key] = null;
      continue;
    }
    payload[field.key] = typeof value === 'string' ? text : value;
  }

  emit('submit', payload);
}
</script>

<template>
  <EuDialog :open="open" :title="title" wide @close="emit('close')">
    <EuDetailMask v-if="editing">
      <EuDetailField
        v-for="field in fields"
        :key="field.key"
        :label="field.label"
        :type="typeOf(field)"
        :required="field.required"
        :step="field.step"
        :options="optionsFor(field)"
        :model-value="displayValue(field)"
        :saved-value="saved[field.key]"
        @update:model-value="values[field.key] = $event"
      />
    </EuDetailMask>

    <p v-if="shownError" class="eu-detail__error" role="alert">{{ shownError }}</p>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-detail__error {
  margin: 1rem 0 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
