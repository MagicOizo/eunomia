<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

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

const { t } = useI18n();

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
  if (reimbursement.value === null) return fail(t('invoices.allocation.amountRequired'));
  // Checked here as well as on the server, so a correction is not sent only to
  // come back rejected.
  if (Math.round(reimbursement.value * 100) > Math.round(maxReimbursement() * 100)) {
    return fail(t('invoices.allocation.tooMuch', { max: formatMoney(maxReimbursement()) }));
  }
  emit('submit', {
    allocationUID: allocation.allocationUID,
    reimbursement: reimbursement.value,
    receiptNumber: receiptNumber.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog :open="open" :title="t('invoices.allocation.title')" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <i18n-t
        v-if="allocation && invoice"
        keypath="invoices.allocation.note"
        tag="p"
        class="eu-form__note"
        scope="global"
      >
        <template #invoice>{{ invoice.invoiceNumber }}</template>
        <template #amount>
          <button
            type="button"
            class="eu-alloc__take"
            :aria-label="
              t('invoices.allocation.takeAmount', { amount: formatMoney(invoice.invoiceAmount) })
            "
            :title="
              t('invoices.allocation.takeAmountHint', {
                amount: formatMoney(invoice.invoiceAmount),
              })
            "
            @click="takeInvoiceAmount"
          >
            {{ formatMoney(invoice.invoiceAmount) }}
          </button>
        </template>
        <template #billing>{{ allocation.billingNumber }}</template>
        <template #date>{{ formatDate(allocation.billingDate) }}</template>
      </i18n-t>
      <div class="eu-alloc__fields">
        <EuCurrencyField v-model="reimbursement" :label="t('fields.reimbursement')" />
        <EuTextField v-model="receiptNumber" :label="t('fields.receiptNumber')" />
      </div>
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? t('common.saving') : t('common.save')
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
