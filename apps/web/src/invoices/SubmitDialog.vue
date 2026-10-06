<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { todayIso } from '../lib/date-input';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { formatDate, plural } from '../lib/format';
import type { InvoiceDto } from './api';
import { type ContractOption, contractsCoveringPeriod, treatmentPeriod } from './eligibility';
import InvoiceBriefList from './InvoiceBriefList.vue';

const props = defineProps<
  FormDialogProps & {
    /** The invoices that will be submitted, listed so the selection is visible. */
    invoices: InvoiceDto[];
    /** facilityUID → name, for the list's provider column. */
    facilityNames: Record<string, string>;
    /** Only the policies every selected invoice can still go to (see eligibility.ts). */
    contracts: ContractOption[];
  }
>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { contractUID: string; submittedDate: string }];
}>();

const contractUID = ref('');
const submittedDate = ref('');
/**
 * Shows the policies that did not run over the treatment period. Off by
 * default — the usual case is one policy and one obvious answer — but never
 * gone: an insurer does accept a treatment from before the contract began, so
 * the API does not forbid it and neither does this dialog.
 */
const showAll = ref(false);

/** The span the selection covers; what a policy has to cover to be offered. */
const period = computed(() => treatmentPeriod(props.invoices));
const inPeriod = computed(() => contractsCoveringPeriod(props.contracts, period.value));
const hiddenCount = computed(() => props.contracts.length - inPeriod.value.length);

/** The policies in the picker, each with the term it ran as a second line. */
const offered = computed(() =>
  (showAll.value ? props.contracts : inPeriod.value).map((c) => ({
    value: c.value,
    label: c.label,
    hint: contractTerm(c),
  })),
);

const periodLabel = computed(() => {
  const span = period.value;
  if (!span) return '';
  return span.from === span.to
    ? formatDate(span.from)
    : `${formatDate(span.from)} – ${formatDate(span.to)}`;
});

/** "01.01.2020 – 31.12.2023", or "ab 01.01.2020" while the policy still runs. */
function contractTerm(contract: ContractOption): string {
  return contract.contractEnd === null
    ? `ab ${formatDate(contract.contractBegin)}`
    : `${formatDate(contract.contractBegin)} – ${formatDate(contract.contractEnd)}`;
}

const { shownError, fail, clear } = useFormDialog(props, () => {
  showAll.value = false;
  submittedDate.value = todayIso();
  contractUID.value = offered.value.length === 1 ? offered.value[0].value : '';
});

// Keeps the choice and the list in step while the switch is thrown: one policy
// left means it is the answer, and a policy the switch takes back out of the
// list must not stay picked behind it.
watch(offered, (options) => {
  if (options.length === 1) contractUID.value = options[0].value;
  else if (!options.some((o) => o.value === contractUID.value)) contractUID.value = '';
});

function submit(): void {
  clear();
  if (!contractUID.value || !submittedDate.value) {
    return fail('Bitte Police und Einreichungsdatum wählen.');
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
        <p v-if="offered.length === 0" class="eu-form__note" role="status">
          Keine Police lief im Behandlungszeitraum ({{ periodLabel }}). Mit dem Schalter sind alle
          Policen wählbar.
        </p>
        <p v-else-if="!showAll && hiddenCount > 0" class="eu-form__note" role="status">
          {{ plural(hiddenCount, 'Police', 'Policen') }} außerhalb des Behandlungszeitraums
          {{ hiddenCount === 1 ? 'ist' : 'sind' }} ausgeblendet.
        </p>
        <EuToggle
          v-if="hiddenCount > 0"
          v-model="showAll"
          label="Auch Policen außerhalb des Behandlungszeitraums"
        />
        <EuEntityPicker
          :model-value="contractUID || null"
          label="Police"
          required
          :options="offered"
          @update:model-value="contractUID = $event ?? ''"
        />
        <EuTextField v-model="submittedDate" label="Einreichungsdatum" type="date" />
      </template>
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting || offered.length === 0" @click="submit">
        {{ submitting ? 'Einreichen…' : 'Einreichen' }}
      </EuButton>
    </template>
  </EuDialog>
</template>
