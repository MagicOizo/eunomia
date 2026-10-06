<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { formatDate, formatMoney } from '../lib/format';
import type { InvoiceAllocationDto, InvoiceDto } from './api';

/**
 * Corrects a reimbursement that is already booked: its amount and its receipt
 * number. Everything else about the booking stays — which invoice it sits on
 * and which Leistungsabrechnung it came from is what the booking *is*; moving
 * it elsewhere remains removing it and booking it anew.
 */
const props = defineProps<
  FormDialogProps & {
    /** The booked reimbursement to correct. */
    allocation: InvoiceAllocationDto | null;
    /** The invoice it is booked on — for its number and what is still open on it. */
    invoice: InvoiceDto | null;
  }
>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { allocationUID: string; reimbursement: number; receiptNumber: string | null }];
}>();

const reimbursement = ref<number | null>(null);
const receiptNumber = ref('');

/**
 * The most this one booking may carry: what is still open on the invoice plus
 * what this booking itself takes up today — it is being replaced, so it does
 * not count against itself (the server checks the same way).
 */
const maxReimbursement = (): number =>
  (props.invoice?.remainingAmount ?? 0) + (props.allocation?.reimbursement ?? 0);

const { shownError, fail, clear } = useFormDialog(props, () => {
  const allocation = props.allocation;
  if (!allocation) return;
  reimbursement.value = allocation.reimbursement;
  receiptNumber.value = allocation.receiptNumber ?? '';
});

/**
 * The invoice amount named in the note goes into the field below it (issues.md
 * 0.13.0-4), the same shortcut the Zuordnen dialog offers. What is too much for
 * this one booking is caught on save, here as on the server.
 */
function takeInvoiceAmount(): void {
  if (props.invoice) reimbursement.value = props.invoice.invoiceAmount;
}

function submit(): void {
  const allocation = props.allocation;
  if (!allocation) return;
  clear();
  if (reimbursement.value === null) return fail('Bitte den Erstattungsbetrag angeben.');
  // Checked here as well as on the server, so a correction is not sent only to
  // come back rejected.
  if (Math.round(reimbursement.value * 100) > Math.round(maxReimbursement() * 100)) {
    return fail(
      `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen — hier sind höchstens ${formatMoney(
        maxReimbursement(),
      )} möglich.`,
    );
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
        Rechnung {{ invoice.invoiceNumber }} über
        <button
          type="button"
          class="eu-alloc__take"
          :aria-label="`Rechnungsbetrag ${formatMoney(invoice.invoiceAmount)} in Erstattung übernehmen`"
          :title="`${formatMoney(invoice.invoiceAmount)} in Erstattung übernehmen`"
          @click="takeInvoiceAmount"
        >
          {{ formatMoney(invoice.invoiceAmount) }}</button
        >, erstattet über Abrechnung {{ allocation.billingNumber }} vom
        {{ formatDate(allocation.billingDate) }}.
      </p>
      <div class="eu-alloc__fields">
        <EuCurrencyField v-model="reimbursement" label="Erstattung" />
        <EuTextField v-model="receiptNumber" label="Belegnummer" />
      </div>
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
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
/* The amount in the note is also the way into the field under it (issues.md
   0.13.0-4): text at rest, clickable on hover and focus — the same shortcut as in
   the Zuordnen dialog. */
.eu-alloc__take {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  border-radius: 0.2em;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 0.2em;
}

.eu-alloc__take:hover,
.eu-alloc__take:focus-visible {
  color: var(--eu-color-accent-text);
  text-decoration-style: solid;
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
