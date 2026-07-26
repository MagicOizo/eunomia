<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import EuSelectField, { type SelectOption } from '../components/resource/EuSelectField.vue';
import type { InvoiceDto } from './api';

const props = defineProps<{
  open: boolean;
  /** The invoice being edited, or null when creating. */
  editing: InvoiceDto | null;
  accountUID: string;
  facilities: SelectOption[];
  agencies: SelectOption[];
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: Record<string, unknown>] }>();

const form = ref({
  invoiceNumber: '',
  invoiceDate: '',
  treatmentDate: '',
  facilityUID: '',
  invoiceAmount: null as number | null,
  agencyUID: '',
  transferUntilDate: '',
  transferSubject: '',
  documentLink: '',
});
// directPayment = the bill was already paid directly, e.g. cash at a pharmacy —
// so there is nothing left for the user to transfer.
const directPayment = ref(false);
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.editing] as const,
  ([open]) => {
    if (!open) return;
    localError.value = null;
    const e = props.editing;
    form.value = {
      invoiceNumber: e?.invoiceNumber ?? '',
      invoiceDate: e?.invoiceDate ?? '',
      treatmentDate: e?.treatmentDate ?? '',
      facilityUID: e?.facilityUID ?? '',
      invoiceAmount: e ? e.invoiceAmount : null,
      agencyUID: e?.agencyUID ?? '',
      transferUntilDate: e?.transferUntilDate ?? '',
      transferSubject: e?.transferSubject ?? '',
      documentLink: e?.documentLink ?? '',
    };
    directPayment.value = e ? e.directPayment === 1 : false;
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  const f = form.value;
  if (!f.invoiceNumber.trim() || !f.invoiceDate || !f.treatmentDate || f.invoiceAmount === null) {
    localError.value = 'Bitte Rechnungsnummer, Rechnungsdatum, Behandlungsdatum und Betrag ausfüllen.';
    return;
  }

  const dp = directPayment.value;
  const payload: Record<string, unknown> = {
    invoiceNumber: f.invoiceNumber.trim(),
    invoiceDate: f.invoiceDate,
    treatmentDate: f.treatmentDate,
    invoiceAmount: f.invoiceAmount,
    directPayment: dp,
    facilityUID: f.facilityUID || null,
    documentLink: f.documentLink.trim() || null,
    // When paid directly there is no transfer, so these are always cleared.
    transferUntilDate: dp ? null : f.transferUntilDate || null,
    transferSubject: dp ? null : f.transferSubject.trim() || null,
    agencyUID: dp ? null : f.agencyUID || null,
  };
  // accountUID is immutable after creation.
  if (!props.editing) payload.accountUID = props.accountUID;

  emit('submit', payload);
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="editing ? 'Rechnung bearbeiten' : 'Rechnung anlegen'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <EuTextField v-model="form.invoiceNumber" label="Rechnungsnummer" />
      <EuTextField v-model="form.invoiceDate" label="Rechnungsdatum" type="date" />
      <EuTextField v-model="form.treatmentDate" label="Behandlungsdatum" type="date" />
      <EuSelectField v-model="form.facilityUID" label="Leistungserbringer" :options="facilities" />
      <EuCurrencyField v-model="form.invoiceAmount" label="Betrag" />

      <EuToggle v-model="directPayment" label="Direkt-/Barzahlung" />

      <template v-if="!directPayment">
        <EuTextField v-model="form.transferUntilDate" label="Zahlungsziel" type="date" />
        <EuTextField v-model="form.transferSubject" label="Verwendungszweck" />
        <EuSelectField v-model="form.agencyUID" label="Inkasso-Firma" :options="agencies" />
      </template>

      <EuTextField v-model="form.documentLink" label="Dokument-Link" />
      <p v-if="error ?? localError" class="eu-form__error" role="alert">{{ error ?? localError }}</p>
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
