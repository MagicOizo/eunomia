<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { type SelectOption } from '../components/resource/EuSelectField.vue';
import { plural } from '../lib/format';
import type { InvoiceDto } from './api';
import InvoiceBriefList from './InvoiceBriefList.vue';

const props = defineProps<{
  open: boolean;
  /** The invoices that will be submitted, listed so the selection is visible. */
  invoices: InvoiceDto[];
  /** facilityUID → name, for the list's provider column. */
  facilityNames: Record<string, string>;
  /** Only the policies every selected invoice can still go to (see eligibility.ts). */
  contracts: SelectOption[];
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { contractUID: string; submittedDate: string }];
}>();

const contractUID = ref('');
const submittedDate = ref('');
const localError = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localError.value = null;
    contractUID.value = props.contracts.length === 1 ? props.contracts[0].value : '';
    submittedDate.value = new Date().toISOString().slice(0, 10);
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  if (!contractUID.value || !submittedDate.value) {
    localError.value = 'Bitte Police und Einreichungsdatum wählen.';
    return;
  }
  emit('submit', {
    contractUID: contractUID.value,
    submittedDate: submittedDate.value,
  });
}
</script>

<template>
  <EuDialog :open="open" title="Rechnungen einreichen" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p class="eu-form__note">
        {{ plural(invoices.length, 'Rechnung wird', 'Rechnungen werden') }} als eine Einreichung
        gebündelt.
      </p>
      <InvoiceBriefList :invoices="invoices" :facility-names="facilityNames" />
      <p v-if="contracts.length === 0" class="eu-form__note" role="status">
        Keine Police verfügbar: Die Rechnungen liegen bereits bei allen Policen oder sind dort als
        nicht erstattungsfähig markiert.
      </p>
      <template v-else>
        <EuEntityPicker
          :model-value="contractUID || null"
          label="Police"
          required
          :options="contracts"
          @update:model-value="contractUID = $event ?? ''"
        />
        <EuTextField v-model="submittedDate" label="Einreichungsdatum" type="date" />
      </template>
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting || contracts.length === 0" @click="submit">
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
