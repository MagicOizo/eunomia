<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../../design-system/components/EuButton.vue';
import EuCurrencyField from '../../design-system/components/EuCurrencyField.vue';
import EuDialog from '../../design-system/components/EuDialog.vue';
import EuEntityPicker from '../../design-system/components/EuEntityPicker.vue';
import EuTextField from '../../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../../lib/form-dialog';
import type { FieldConfig } from '../../resources/config';
import { type SelectOption } from './EuSelectField.vue';

/**
 * The classic create form: fields full width, one below the other. Viewing and
 * editing an existing row is the display mask instead (ResourceDetailDialog),
 * the separation dialog-design.md asks for.
 */
const props = defineProps<
  FormDialogProps & {
    title: string;
    fields: FieldConfig[];
    /** Select options keyed by lookup name (see ResourceConfig.lookups). */
    options: Record<string, SelectOption[]>;
    /** Seeds field values (e.g. an ad-hoc name typed elsewhere). */
    prefill?: Record<string, string>;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: Record<string, unknown>] }>();

const values = ref<Record<string, string>>({});

const { shownError, fail, clear } = useFormDialog(props);

/**
 * Keeps `values` in sync with the fields (prefill, then the field's default).
 * The one seeding of the project that does not go through useFormDialog: it
 * runs even while closed, so every field always has a string value (never
 * undefined) — the dialog body is rendered even when hidden, so an undefined
 * bound to a field component would warn. Depends on `fields` too, so switching
 * resources (the view is reused) rebuilds for the new keys.
 */
watch(
  () => [props.open, props.fields, props.prefill] as const,
  () => {
    clear();
    const next: Record<string, string> = {};
    for (const field of props.fields) {
      next[field.key] = props.prefill?.[field.key] ?? field.defaultValue ?? '';
    }
    values.value = next;
  },
  { immediate: true },
);

function submit(): void {
  clear();
  const payload: Record<string, unknown> = {};

  for (const field of props.fields) {
    const value = (values.value[field.key] ?? '').trim();
    if (value === '') {
      if (field.required) return fail(`Bitte „${field.label}“ ausfüllen.`);
      continue; // omit empty optionals so the server keeps its default / null
    }
    const numeric = field.type === 'number' || field.type === 'currency';
    payload[field.key] = numeric ? Number(value) : value;
  }

  emit('submit', payload);
}
</script>

<template>
  <EuDialog :open="open" :title="title" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <template v-for="field in fields" :key="field.key">
        <EuEntityPicker
          v-if="field.type === 'select'"
          :model-value="values[field.key] || null"
          :label="field.label"
          :required="field.required"
          :options="field.options ?? (field.optionsFrom ? (options[field.optionsFrom] ?? []) : [])"
          @update:model-value="values[field.key] = $event ?? ''"
        />
        <EuCurrencyField
          v-else-if="field.type === 'currency'"
          :model-value="values[field.key] ? Number(values[field.key]) : null"
          :label="field.label"
          @update:model-value="values[field.key] = $event === null ? '' : String($event)"
        />
        <EuTextField v-else v-model="values[field.key]" :label="field.label" :type="field.type" />
      </template>
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>
</template>
