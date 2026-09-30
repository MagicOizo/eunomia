<script setup lang="ts">
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { computed, ref, toRef, watch } from 'vue';

import PaymentDetailFormDialog from '../agencies/PaymentDetailFormDialog.vue';
import type { AgencyPaymentDetailDto } from '../agencies/api';
import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker, { type PickerOption } from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { type SelectOption } from '../components/resource/EuSelectField.vue';
import ResourceFormDialog from '../components/resource/ResourceFormDialog.vue';
import { usePaymentDetailPicker } from './payment-detail-picker';
import type { InvoiceDto } from './api';
import { CREATE_KINDS, useEntityCreate } from './entity-create';
import {
  differentYearsMessage,
  furtherDays,
  normalizeDays,
  sameCalendarYear,
} from './treatment-days';

const props = defineProps<{
  open: boolean;
  /** The invoice being edited, or null when creating. */
  editing: InvoiceDto | null;
  accountUID: string;
  facilities: SelectOption[];
  agencies: SelectOption[];
  /** agencyUID → its payment details, to pick the ones the invoice goes to. */
  agencyPaymentDetails: Record<string, AgencyPaymentDetailDto[]>;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: Record<string, unknown>];
  /** An entity was created on the side: the parent's lookup lists are stale. */
  entityCreated: [];
}>();

const form = ref({
  invoiceNumber: '',
  invoiceDate: '',
  treatmentDate: '',
  facilityUID: '',
  invoiceAmount: null as number | null,
  agencyUID: '',
  agencyAccountUID: '',
  transferUntilDate: '',
  transferSubject: '',
  documentLink: '',
});
// The days besides the leading one, one per repeatable row. An empty row is a
// row still being filled in and is dropped on save, not complained about.
const extraDays = ref<string[]>([]);
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

// The payment details of the picked agency (Slice 44), with their ad-hoc create.
const paymentDetailPicker = usePaymentDetailPicker(toRef(props, 'agencyPaymentDetails'));
watch(
  () => props.agencyPaymentDetails,
  (map) => paymentDetailPicker.refresh(map),
);
const paymentDetailOptions = computed(() => paymentDetailPicker.optionsOf(form.value.agencyUID));

/** Picking an agency suggests its first details; clearing it takes both. */
function pickAgency(uid: string | null): void {
  form.value.agencyUID = uid ?? '';
  form.value.agencyAccountUID = uid === null ? '' : paymentDetailPicker.suggestionFor(uid);
}

// Ad-hoc create ("‹typed name› hinzufügen") — reuses the resource create form.
const {
  open: createOpen,
  kind: createKind,
  prefill: createPrefill,
  busy: createBusy,
  error: createError,
  start: openCreate,
  submit: onCreateSubmit,
} = useEntityCreate((kind, option, row) => {
  if (kind === 'facility') {
    localFacilities.value = [...localFacilities.value, option];
    form.value.facilityUID = option.value;
  } else {
    localAgencies.value = [...localAgencies.value, option];
    // A new agency is created with its first details; those are the pick.
    paymentDetailPicker.remember(option.value, (row.accounts ?? []) as AgencyPaymentDetailDto[]);
    pickAgency(option.value);
  }
  emit('entityCreated');
});

/** What was added from the picker is selected right away. */
async function onPaymentDetailCreate(
  payload: Parameters<typeof paymentDetailPicker.submit>[0],
): Promise<void> {
  const uid = await paymentDetailPicker.submit(payload);
  if (uid !== null) form.value.agencyAccountUID = uid;
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
      agencyAccountUID: e?.agencyAccountUID ?? '',
      transferUntilDate: e?.transferUntilDate ?? '',
      transferSubject: e?.transferSubject ?? '',
      documentLink: e?.documentLink ?? '',
    };
    extraDays.value = e ? furtherDays(e) : [];
    directPayment.value = e ? e.directPayment : false;
  },
  { immediate: true },
);

function addDay(): void {
  extraDays.value = [...extraDays.value, ''];
}

function removeDay(index: number): void {
  extraDays.value = extraDays.value.filter((_, i) => i !== index);
}

function submit(): void {
  localError.value = null;
  const f = form.value;
  if (!f.invoiceNumber.trim() || !f.invoiceDate || !f.treatmentDate || f.invoiceAmount === null) {
    localError.value =
      'Bitte Rechnungsnummer, Rechnungsdatum, Behandlungsdatum und Betrag ausfüllen.';
    return;
  }
  // The whole list, the leading day included — the API reads `treatmentDates`
  // as the complete set and takes its earliest entry as `treatmentDate`.
  const days = normalizeDays([f.treatmentDate, ...extraDays.value]);
  if (!sameCalendarYear(days)) {
    // The API's own sentence, so the dialog and the round trip say the same.
    localError.value = differentYearsMessage();
    return;
  }

  const dp = directPayment.value;
  const payload: Record<string, unknown> = {
    invoiceNumber: f.invoiceNumber.trim(),
    invoiceDate: f.invoiceDate,
    treatmentDate: f.treatmentDate,
    treatmentDates: days,
    invoiceAmount: f.invoiceAmount,
    directPayment: dp,
    facilityUID: f.facilityUID || null,
    documentLink: f.documentLink.trim() || null,
    // When paid directly there is no transfer, so these are cleared — the API
    // then dates the invoice as due and paid on its own date (Slice 43).
    transferUntilDate: dp ? null : f.transferUntilDate || null,
    transferSubject: dp ? null : f.transferSubject.trim() || null,
    agencyUID: dp ? null : f.agencyUID || null,
    agencyAccountUID: dp ? null : f.agencyAccountUID || null,
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

      <!-- One bill of a practice often covers several appointments (Slice 41),
           but only about one in ten: the first day stays the field above, the
           rest are rows that appear behind a quiet add action instead of a
           bordered group that reads like a required entry (issues.md 0.13.0-3). -->
      <div class="eu-form__days">
        <div v-for="(day, index) in extraDays" :key="index" class="eu-form__day">
          <EuTextField
            :model-value="day"
            :label="`Behandlungstag ${index + 2}`"
            type="date"
            @update:model-value="extraDays[index] = $event"
          />
          <EuButton
            variant="secondary"
            icon-only
            :icon="faXmark"
            :aria-label="`Behandlungstag ${index + 2} entfernen`"
            @click="removeDay(index)"
          />
        </div>
        <p v-if="extraDays.length > 0" class="eu-form__hint">
          Alle Behandlungstage müssen im selben Kalenderjahr liegen.
        </p>
        <EuButton class="eu-form__add-day" variant="ghost" :icon="faPlus" @click="addDay"
          >Behandlungstag hinzufügen</EuButton
        >
      </div>
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

      <!-- What a direct payment does to the two dates is the API's rule
           (Slice 43) and needs no sentence here: the fields it would talk
           about are gone from the form the moment the switch is on. -->
      <EuToggle v-model="directPayment" label="Direkt-/Barzahlung" />

      <template v-if="!directPayment">
        <EuTextField v-model="form.transferUntilDate" label="Zahlungsziel" type="date" />
        <EuTextField v-model="form.transferSubject" label="Verwendungszweck" />
        <EuEntityPicker
          :model-value="form.agencyUID || null"
          label="Abrechnungsdienstleister"
          :options="localAgencies"
          allow-create
          create-noun="Abrechnungsdienstleister"
          @update:model-value="pickAgency($event)"
          @create="openCreate('agency', $event)"
        />
        <!-- An agency holds several sets at once, and the bill names the
             one it is to be paid on (Slice 44). Only once an agency is picked:
             without one there is nothing to choose between. -->
        <EuEntityPicker
          v-if="form.agencyUID"
          :model-value="form.agencyAccountUID || null"
          label="Kontoverbindung"
          :options="paymentDetailOptions"
          allow-create
          create-noun="Kontoverbindung"
          @update:model-value="form.agencyAccountUID = $event ?? ''"
          @create="paymentDetailPicker.start(form.agencyUID)"
        />
      </template>

      <EuTextField v-model="form.documentLink" label="Dokument-Link" />
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

  <!-- Adding payment details to the picked agency, from its picker above. -->
  <PaymentDetailFormDialog
    :open="paymentDetailPicker.dialogOpen.value"
    :entry="null"
    :submitting="paymentDetailPicker.busy.value"
    :error="paymentDetailPicker.error.value"
    @close="paymentDetailPicker.dialogOpen.value = false"
    @submit="onPaymentDetailCreate"
  />

  <!-- Ad-hoc create for the entity picked above, prefilled with the typed name. -->
  <ResourceFormDialog
    :open="createOpen"
    :title="`${CREATE_KINDS[createKind].config.singular} anlegen`"
    :fields="CREATE_KINDS[createKind].config.fields"
    :options="{}"
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

.eu-form__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}

/* The extra days hang under the treatment date, closer to it than a form row
   would be: they belong to that field rather than standing beside it. */
.eu-form__days {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: -0.6rem;
}

/* Quiet by design: smaller than a form button and without a frame, so an entry
   that is the exception does not look like one that is expected. */
.eu-form__add-day {
  align-self: flex-start;
  font-size: 0.9rem;
  padding: 0.35em 0.6em;
}

/* The remove action sits at the field's baseline, next to it (create mode puts
   actions beside the field, not in a column — dialog-design.md). */
.eu-form__day {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
}

.eu-form__day > :first-child {
  flex: 1;
}
</style>
