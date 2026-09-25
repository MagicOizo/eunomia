<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { euro, germanDate } from '../lib/format';
import type { InvoiceAllocationDto, InvoiceDto } from './api';

/**
 * Corrects a reimbursement that is already booked: its amount and its receipt
 * number. Everything else about the booking stays — which invoice it sits on
 * and which Leistungsabrechnung it came from is what the booking *is*; moving
 * it elsewhere remains removing it and booking it anew.
 */
const props = defineProps<{
  open: boolean;
  /** The booked reimbursement to correct. */
  allocation: InvoiceAllocationDto | null;
  /** The invoice it is booked on — for its number and what is still open on it. */
  invoice: InvoiceDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { allocationUID: string; reimbursement: number; receiptNumber: string | null }];
}>();

const reimbursement = ref<number | null>(null);
const receiptNumber = ref('');
const localError = ref<string | null>(null);

/**
 * The most this one booking may carry: what is still open on the invoice plus
 * what this booking itself takes up today — it is being replaced, so it does
 * not count against itself (the server checks the same way).
 */
const maxReimbursement = (): number =>
  (props.invoice?.remainingAmount ?? 0) + (props.allocation?.reimbursement ?? 0);

watch(
  () => props.open,
  (open) => {
    if (!open || !props.allocation) return;
    localError.value = null;
    reimbursement.value = props.allocation.reimbursement;
    receiptNumber.value = props.allocation.receiptNumber ?? '';
  },
  { immediate: true },
);

function submit(): void {
  const allocation = props.allocation;
  if (!allocation) return;
  localError.value = null;
  if (reimbursement.value === null) {
    localError.value = 'Bitte den Erstattungsbetrag angeben.';
    return;
  }
  // Checked here as well as on the server, so a correction is not sent only to
  // come back rejected.
  if (Math.round(reimbursement.value * 100) > Math.round(maxReimbursement() * 100)) {
    localError.value = `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen — hier sind höchstens ${euro(
      maxReimbursement(),
    )} möglich.`;
    return;
  }
  emit('submit', {
    allocationUID: allocation.allocationUID,
    reimbursement: reimbursement.value,
    receiptNumber: receiptNumber.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog :open="open" title="Erstattung ändern" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="allocation && invoice" class="eu-form__note">
        Rechnung {{ invoice.invoiceNumber }} über {{ euro(invoice.invoiceAmount) }}, erstattet über
        Abrechnung {{ allocation.billingNumber }} vom {{ germanDate(allocation.billingDate) }}.
      </p>
      <div class="eu-alloc__fields">
        <EuCurrencyField v-model="reimbursement" label="Erstattung" />
        <EuTextField v-model="receiptNumber" label="Belegnummer" />
      </div>
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? 'Speichern…' : 'Speichern'
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

.eu-alloc__fields {
  display: flex;
  gap: 0.75rem;
}

.eu-alloc__fields > * {
  flex: 1;
  min-width: 0;
}
</style>
