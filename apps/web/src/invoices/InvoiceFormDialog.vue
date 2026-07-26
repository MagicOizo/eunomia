<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker, { type PickerOption } from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { type SelectOption } from '../components/resource/EuSelectField.vue';
import ResourceFormDialog from '../components/resource/ResourceFormDialog.vue';
import { HttpError } from '../lib/http';
import { createResource } from '../lib/resource';
import type { ResourceConfig } from '../resources/config';
import { resourceConfigs } from '../resources/definitions';
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

// Local option copies so an ad-hoc-created entity can be appended and selected
// immediately, without waiting for the parent to reload its lists.
const localFacilities = ref<PickerOption[]>([]);
const localAgencies = ref<PickerOption[]>([]);
watch(
  () => props.facilities,
  (list) => (localFacilities.value = list.map((o) => ({ value: o.value, label: o.label }))),
  { immediate: true },
);
watch(
  () => props.agencies,
  (list) => (localAgencies.value = list.map((o) => ({ value: o.value, label: o.label }))),
  { immediate: true },
);

// Ad-hoc create ("‹typed name› hinzufügen") — reuses the resource create form.
type CreateKind = 'facility' | 'agency';
const kinds: Record<CreateKind, { path: string; config: ResourceConfig; noun: string }> = {
  facility: { path: '/facilities', config: resourceConfigs['/facilities'], noun: 'Leistungserbringer' },
  agency: { path: '/agencies', config: resourceConfigs['/agencies'], noun: 'Inkasso-Firma' },
};
const createOpen = ref(false);
const createKind = ref<CreateKind>('facility');
const createPrefill = ref<Record<string, string>>({});
const createBusy = ref(false);
const createError = ref<string | null>(null);

function openCreate(kind: CreateKind, query: string): void {
  createKind.value = kind;
  createPrefill.value = { [kinds[kind].config.columns[0].key]: query };
  createError.value = null;
  createOpen.value = true;
}

async function onCreateSubmit(payload: Record<string, unknown>): Promise<void> {
  const kind = kinds[createKind.value];
  createBusy.value = true;
  createError.value = null;
  try {
    const row = await createResource(kind.path, payload);
    const option: PickerOption = {
      value: String(row[kind.config.idKey]),
      label: String(row[kind.config.columns[0].key]),
    };
    if (createKind.value === 'facility') {
      localFacilities.value = [...localFacilities.value, option];
      form.value.facilityUID = option.value;
    } else {
      localAgencies.value = [...localAgencies.value, option];
      form.value.agencyUID = option.value;
    }
    createOpen.value = false;
  } catch (err) {
    createError.value = err instanceof HttpError ? err.message : 'Anlegen fehlgeschlagen.';
  } finally {
    createBusy.value = false;
  }
}

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
      <EuEntityPicker
        :model-value="form.facilityUID || null"
        label="Leistungserbringer"
        :options="localFacilities"
        allow-create
        create-noun="Leistungserbringer"
        @update:model-value="form.facilityUID = $event ?? ''"
        @create="openCreate('facility', $event)"
      />
      <EuCurrencyField v-model="form.invoiceAmount" label="Betrag" />

      <EuToggle v-model="directPayment" label="Direkt-/Barzahlung" />

      <template v-if="!directPayment">
        <EuTextField v-model="form.transferUntilDate" label="Zahlungsziel" type="date" />
        <EuTextField v-model="form.transferSubject" label="Verwendungszweck" />
        <EuEntityPicker
          :model-value="form.agencyUID || null"
          label="Inkasso-Firma"
          :options="localAgencies"
          allow-create
          create-noun="Inkasso-Firma"
          @update:model-value="form.agencyUID = $event ?? ''"
          @create="openCreate('agency', $event)"
        />
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

  <!-- Ad-hoc create for the entity picked above, prefilled with the typed name. -->
  <ResourceFormDialog
    :open="createOpen"
    :title="`${kinds[createKind].config.singular} anlegen`"
    :fields="kinds[createKind].config.fields"
    :options="{}"
    :editing="null"
    :prefill="createPrefill"
    :submitting="createBusy"
    :error="createError"
    @close="createOpen = false"
    @submit="onCreateSubmit"
  />
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
