<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../../design-system/components/EuButton.vue';
import EuDialog from '../../design-system/components/EuDialog.vue';
import EuTextField from '../../design-system/components/EuTextField.vue';
import type { ResourceRow } from '../../lib/resource';
import type { FieldConfig } from '../../resources/config';
import EuSelectField, { type SelectOption } from './EuSelectField.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  fields: FieldConfig[];
  /** Select options keyed by lookup name (see ResourceConfig.lookups). */
  options: Record<string, SelectOption[]>;
  /** The row being edited, or null when creating. */
  editing: ResourceRow | null;
  submitting: boolean;
  /** Server-side error message to show above the buttons. */
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: Record<string, unknown>] }>();

const values = ref<Record<string, string>>({});
const localError = ref<string | null>(null);

/** Rebuilds the form values whenever the dialog opens (create = empty, edit = row). */
watch(
  () => [props.open, props.editing] as const,
  ([open]) => {
    if (!open) return;
    localError.value = null;
    const next: Record<string, string> = {};
    for (const field of props.fields) {
      const raw = props.editing?.[field.key];
      next[field.key] = raw === null || raw === undefined ? '' : String(raw);
    }
    values.value = next;
  },
  { immediate: true },
);

const isEditing = (): boolean => props.editing !== null;

function submit(): void {
  localError.value = null;
  const payload: Record<string, unknown> = {};

  for (const field of props.fields) {
    // Immutable fields (e.g. a contract's account) cannot change after creation.
    if (field.immutable && isEditing()) continue;

    const value = (values.value[field.key] ?? '').trim();
    if (value === '') {
      if (field.required) {
        localError.value = `Bitte „${field.label}" ausfüllen.`;
        return;
      }
      continue; // omit empty optionals so the server keeps its default / null
    }
    payload[field.key] = field.type === 'number' ? Number(value) : value;
  }

  emit('submit', payload);
}
</script>

<template>
  <EuDialog :open="open" :title="title" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <template v-for="field in fields" :key="field.key">
        <EuSelectField
          v-if="field.type === 'select'"
          v-model="values[field.key]"
          :label="field.label"
          :required="field.required"
          :disabled="field.immutable && isEditing()"
          :options="field.optionsFrom ? (options[field.optionsFrom] ?? []) : []"
        />
        <EuTextField
          v-else
          v-model="values[field.key]"
          :label="field.label"
          :type="field.type"
        />
      </template>
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
