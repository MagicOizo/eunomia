<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuSelectField, { type SelectOption } from '../components/resource/EuSelectField.vue';

const props = defineProps<{
  open: boolean;
  /** How many invoices will be submitted. */
  count: number;
  contracts: SelectOption[];
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { contractUID: string; submittedDate: string; documentLink?: string }];
}>();

const contractUID = ref('');
const submittedDate = ref('');
const documentLink = ref('');
const localError = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localError.value = null;
    contractUID.value = props.contracts.length === 1 ? props.contracts[0].value : '';
    submittedDate.value = new Date().toISOString().slice(0, 10);
    documentLink.value = '';
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  if (!contractUID.value || !submittedDate.value) {
    localError.value = 'Bitte Vertrag und Einreichungsdatum wählen.';
    return;
  }
  emit('submit', {
    contractUID: contractUID.value,
    submittedDate: submittedDate.value,
    ...(documentLink.value.trim() ? { documentLink: documentLink.value.trim() } : {}),
  });
}
</script>

<template>
  <EuDialog :open="open" title="Rechnungen einreichen" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p class="eu-form__note">{{ count }} Rechnung(en) werden als eine Einreichung gebündelt.</p>
      <EuSelectField v-model="contractUID" label="Vertrag" required :options="contracts" />
      <EuTextField v-model="submittedDate" label="Einreichungsdatum" type="date" />
      <EuTextField v-model="documentLink" label="Dokument-Link" />
      <p v-if="error ?? localError" class="eu-form__error" role="alert">{{ error ?? localError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Einreichen…' : 'Einreichen' }}
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

.eu-form__note {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
