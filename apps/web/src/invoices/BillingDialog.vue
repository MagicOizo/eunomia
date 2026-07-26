<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuSelectField from '../components/resource/EuSelectField.vue';
import { type BillingDto, type InvoiceDto, listBillings } from './api';
import { euro } from '../lib/format';

const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      billingUID?: string;
      newBilling?: { billingDate: string; billingNumber: string };
      reimbursement: number;
      receiptNumber?: string;
    },
  ];
}>();

const existingBillings = ref<BillingDto[]>([]);
const mode = ref<'new' | 'existing'>('new');
const selectedBilling = ref('');
const billingDate = ref('');
const billingNumber = ref('');
const reimbursement = ref<number | null>(null);
const receiptNumber = ref('');
const localError = ref<string | null>(null);

const billingOptions = computed(() =>
  existingBillings.value.map((b) => ({ value: b.billingUID, label: `${b.billingNumber} (${b.billingDate})` })),
);

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.invoice?.submissionUID) return;
    localError.value = null;
    mode.value = 'new';
    selectedBilling.value = '';
    billingDate.value = new Date().toISOString().slice(0, 10);
    billingNumber.value = '';
    reimbursement.value = null;
    receiptNumber.value = '';
    existingBillings.value = await listBillings(props.invoice.submissionUID);
    if (existingBillings.value.length > 0) {
      mode.value = 'existing';
      selectedBilling.value = existingBillings.value[0].billingUID;
    }
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  if (reimbursement.value === null) {
    localError.value = 'Bitte den Erstattungsbetrag angeben.';
    return;
  }
  const common = {
    reimbursement: reimbursement.value,
    ...(receiptNumber.value.trim() ? { receiptNumber: receiptNumber.value.trim() } : {}),
  };

  if (mode.value === 'existing') {
    if (!selectedBilling.value) {
      localError.value = 'Bitte eine Abrechnung wählen.';
      return;
    }
    emit('submit', { billingUID: selectedBilling.value, ...common });
    return;
  }

  if (!billingDate.value || !billingNumber.value.trim()) {
    localError.value = 'Bitte Abrechnungsdatum und -nummer angeben.';
    return;
  }
  emit('submit', {
    newBilling: { billingDate: billingDate.value, billingNumber: billingNumber.value.trim() },
    ...common,
  });
}
</script>

<template>
  <EuDialog :open="open" title="Abrechnung zuordnen" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="invoice" class="eu-form__note">
        Rechnung {{ invoice.invoiceNumber }} über {{ euro(invoice.invoiceAmount) }}
      </p>

      <div v-if="existingBillings.length > 0" class="eu-form__modes" role="radiogroup" aria-label="Abrechnung">
        <label><input v-model="mode" type="radio" value="existing" /> Bestehende Abrechnung</label>
        <label><input v-model="mode" type="radio" value="new" /> Neue Abrechnung</label>
      </div>

      <EuSelectField
        v-if="mode === 'existing'"
        v-model="selectedBilling"
        label="Leistungsabrechnung"
        required
        :options="billingOptions"
      />
      <template v-else>
        <EuTextField v-model="billingDate" label="Abrechnungsdatum" type="date" />
        <EuTextField v-model="billingNumber" label="Abrechnungsnummer" />
      </template>

      <EuCurrencyField v-model="reimbursement" label="Erstattungsbetrag" />
      <EuTextField v-model="receiptNumber" label="Belegnummer" />
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

.eu-form__note {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-form__modes {
  display: flex;
  gap: 1rem;
  font-family: var(--eu-font-data);
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
