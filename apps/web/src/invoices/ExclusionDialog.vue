<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';

/** Marks an invoice as "not reimbursable under this policy". */
const props = defineProps<{
  open: boolean;
  /** Policies the invoice is neither submitted to nor already marked for. */
  contracts: SelectOption[];
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { contractUID: string; note: string | null }];
}>();

const contractUID = ref('');
const note = ref('');
const localError = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localError.value = null;
    contractUID.value = props.contracts.length === 1 ? props.contracts[0].value : '';
    note.value = '';
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  if (!contractUID.value) {
    localError.value = 'Bitte die Police wählen.';
    return;
  }
  emit('submit', { contractUID: contractUID.value, note: note.value.trim() || null });
}
</script>

<template>
  <EuDialog :open="open" title="Nicht erstattungsfähig markieren" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <EuEntityPicker
        :model-value="contractUID || null"
        label="Police"
        required
        :options="contracts"
        @update:model-value="contractUID = $event ?? ''"
      />
      <EuTextField v-model="note" label="Notiz (z. B. stationäre Leistung)" />
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? 'Speichern…' : 'Markieren'
      }}</EuButton>
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
