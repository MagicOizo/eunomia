<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { euro } from '../lib/format';
import type { InvoiceDto } from './api';
import { STATUS_DISPLAY } from './status';

/**
 * View/edit an invoice as a compact display mask (see dialog-design.md): three
 * columns of Label | value | per-field clear/reset, borders only on
 * hover/focus. Distinct from the create form (InvoiceFormDialog). Derived
 * values (status, insured person, IBAN of the selected agency, reimbursement)
 * are read-only rows. Saving sends the full field set as a PATCH.
 */
const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
  accountName: string;
  facilities: SelectOption[];
  agencies: SelectOption[];
  /** agencyUID → IBAN, to show the read-only IBAN of the picked agency. */
  agencyIban: Record<string, string>;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: Record<string, unknown>] }>();

const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.invoice] as const,
  ([open, inv]) => {
    if (!open || !inv) return;
    localError.value = null;
    const seed: Record<string, DetailValue> = {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      treatmentDate: inv.treatmentDate,
      facilityUID: inv.facilityUID,
      invoiceAmount: inv.invoiceAmount,
      directPayment: inv.directPayment === 1,
      transferUntilDate: inv.transferUntilDate,
      transferDate: inv.transferDate,
      transferSubject: inv.transferSubject,
      agencyUID: inv.agencyUID,
      documentLink: inv.documentLink,
    };
    Object.assign(values, seed);
    Object.assign(saved, seed);
  },
  { immediate: true },
);

// Switching to direct payment empties the now-inactive fields (only when they
// hold something, so loading a direct-payment invoice doesn't look edited).
watch(
  () => values.directPayment,
  (now) => {
    if (now !== true) return;
    if (values.agencyUID) values.agencyUID = null;
    if (values.transferSubject) values.transferSubject = '';
  },
);

const statusDisplay = computed(() =>
  props.invoice ? STATUS_DISPLAY[props.invoice.workflowStatus] : null,
);
const directPayment = computed(() => values.directPayment === true);
const ibanForSelected = computed(() => {
  const uid = values.agencyUID;
  return typeof uid === 'string' && uid !== '' ? (props.agencyIban[uid] ?? '') : '';
});
const str = (value: DetailValue): string => (typeof value === 'string' ? value.trim() : '');

function submit(): void {
  localError.value = null;
  if (!props.invoice) return;
  if (
    !str(values.invoiceNumber) ||
    !values.invoiceDate ||
    !values.treatmentDate ||
    values.invoiceAmount === null
  ) {
    localError.value = 'Bitte Rechnungsnummer, Rechnungsdatum, Behandlungsdatum und Betrag ausfüllen.';
    return;
  }
  const dp = directPayment.value;
  emit('submit', {
    invoiceNumber: str(values.invoiceNumber),
    invoiceDate: values.invoiceDate,
    treatmentDate: values.treatmentDate,
    invoiceAmount: values.invoiceAmount,
    directPayment: dp,
    facilityUID: values.facilityUID || null,
    documentLink: str(values.documentLink) || null,
    transferUntilDate: values.transferUntilDate || null,
    transferDate: values.transferDate || null,
    // Only the direct-payment-gated fields are cleared when paid directly.
    transferSubject: dp ? null : str(values.transferSubject) || null,
    agencyUID: dp ? null : values.agencyUID || null,
  });
}
</script>

<template>
  <EuDialog :open="open" title="Rechnungsdetails" wide @close="emit('close')">
    <div v-if="invoice" class="eu-detail-grid">
      <EuDetailField
        v-model="values.invoiceNumber"
        :saved-value="saved.invoiceNumber"
        label="Rechnungsnummer"
        type="text"
        required
      />
      <EuDetailField label="Status" type="readonly">
        <template #value>
          <EuBadge v-if="statusDisplay" :tone="statusDisplay.tone" :icon="statusDisplay.icon">
            {{ statusDisplay.label }}
          </EuBadge>
        </template>
      </EuDetailField>
      <EuDetailField
        v-model="values.invoiceDate"
        :saved-value="saved.invoiceDate"
        label="Rechnungsdatum"
        type="date"
        required
      />
      <EuDetailField
        v-model="values.treatmentDate"
        :saved-value="saved.treatmentDate"
        label="Behandlungsdatum"
        type="date"
        required
      />
      <EuDetailField
        v-model="values.facilityUID"
        :saved-value="saved.facilityUID"
        label="Leistungserbringer"
        type="select"
        :options="facilities"
      />
      <EuDetailField label="Versicherter" type="readonly" :model-value="accountName" />

      <!-- "Eingereicht bei" + "Eingereicht am" (submission-derived) folgen mit Slice 16. -->

      <EuDetailField
        v-model="values.transferUntilDate"
        :saved-value="saved.transferUntilDate"
        label="Zahlungsziel"
        type="date"
      />
      <EuDetailField
        v-model="values.transferDate"
        :saved-value="saved.transferDate"
        label="Zahlungsdatum"
        type="date"
      />
      <EuDetailField
        v-model="values.invoiceAmount"
        :saved-value="saved.invoiceAmount"
        label="Rechnungsbetrag"
        type="currency"
        required
      />

      <EuDetailField
        v-model="values.directPayment"
        :saved-value="saved.directPayment"
        label="Direkt-/Barzahlung"
        type="toggle"
      />
      <EuDetailField
        v-model="values.agencyUID"
        :saved-value="saved.agencyUID"
        label="Abrechnungsdienstleister"
        type="select"
        :options="agencies"
        :disabled="directPayment"
      />
      <EuDetailField
        label="IBAN"
        type="readonly"
        :model-value="ibanForSelected"
        :disabled="directPayment"
      />
      <EuDetailField
        v-model="values.transferSubject"
        :saved-value="saved.transferSubject"
        label="Verwendungszweck"
        type="text"
        :disabled="directPayment"
      />

      <EuDetailField
        v-model="values.documentLink"
        :saved-value="saved.documentLink"
        label="Rechnungslink"
        type="text"
      />

      <!-- Zuordnungsblock (Karten je Leistungsabrechnung): Slice 16. -->

      <EuDetailField label="Erstattung" type="readonly" :model-value="euro(invoice.reimbursedTotal)" />
    </div>

    <p v-if="error ?? localError" class="eu-detail-grid__error" role="alert">
      {{ error ?? localError }}
    </p>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-detail-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 1rem;
  row-gap: 0.35rem;
  font-family: var(--eu-font-data);
}

.eu-detail-grid__error {
  margin: 1rem 0 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
