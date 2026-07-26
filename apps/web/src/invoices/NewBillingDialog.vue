<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { euro, germanDate } from '../lib/format';
import { HttpError } from '../lib/http';
import {
  type InvoiceDto,
  type SubmissionDto,
  createAllocation,
  createBilling,
  listAccountInvoices,
  listSubmissions,
} from './api';

const props = defineProps<{ open: boolean; contractUID: string; accountUID: string }>();
const emit = defineEmits<{ close: []; created: [] }>();

const submissions = ref<SubmissionDto[]>([]);
const invoices = ref<InvoiceDto[]>([]);
const submissionUID = ref('');
const billingNumber = ref('');
const billingDate = ref('');
const documentLink = ref('');
const reimbursements = reactive<Record<string, string>>({});
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

const submissionOptions = computed(() =>
  submissions.value.map((s) => ({ value: s.submissionUID, label: `Einreichung vom ${germanDate(s.submittedDate)}` })),
);
/** The invoices of the currently selected submission — the allocation targets. */
const submissionInvoices = computed(() =>
  invoices.value.filter((i) => i.submissionUID === submissionUID.value),
);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    error.value = null;
    submissionUID.value = '';
    billingNumber.value = '';
    billingDate.value = new Date().toISOString().slice(0, 10);
    documentLink.value = '';
    loading.value = true;
    try {
      const [subs, invs] = await Promise.all([listSubmissions(), listAccountInvoices(props.accountUID)]);
      submissions.value = subs.filter((s) => s.contractUID === props.contractUID);
      invoices.value = invs;
      if (submissions.value.length > 0) submissionUID.value = submissions.value[0].submissionUID;
    } catch (err) {
      error.value = err instanceof HttpError ? err.message : 'Daten konnten nicht geladen werden.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

// Reset the per-invoice amounts whenever the selected submission changes.
watch(submissionInvoices, (list) => {
  for (const key of Object.keys(reimbursements)) delete reimbursements[key];
  for (const inv of list) reimbursements[inv.invoiceUID] = '';
});

function save(): void {
  error.value = null;
  if (!submissionUID.value) {
    error.value = 'Bitte eine Einreichung wählen.';
    return;
  }
  if (!billingNumber.value.trim() || !billingDate.value) {
    error.value = 'Bitte Abrechnungsnummer und -datum angeben.';
    return;
  }
  const allocations = submissionInvoices.value
    .map((i) => ({ invoiceUID: i.invoiceUID, amount: Number(reimbursements[i.invoiceUID]) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > 0);

  void (async () => {
    busy.value = true;
    try {
      const billing = await createBilling({
        submissionUID: submissionUID.value,
        billingDate: billingDate.value,
        billingNumber: billingNumber.value.trim(),
        documentLink: documentLink.value.trim() ? documentLink.value.trim() : null,
      });
      for (const a of allocations) {
        await createAllocation({ billingUID: billing.billingUID, invoiceUID: a.invoiceUID, reimbursement: a.amount });
      }
      emit('created');
      emit('close');
    } catch (err) {
      error.value = err instanceof HttpError ? err.message : 'Speichern fehlgeschlagen.';
    } finally {
      busy.value = false;
    }
  })();
}
</script>

<template>
  <EuDialog :open="open" title="Neue Leistungsabrechnung" @close="emit('close')">
    <div class="eu-form">
      <p v-if="loading" class="eu-form__note">Wird geladen…</p>
      <p v-else-if="submissions.length === 0" class="eu-form__note">
        Für diesen Vertrag gibt es noch keine Einreichung. Reiche zuerst Rechnungen im
        Rechnungs-Bereich ein.
      </p>

      <template v-else>
        <EuEntityPicker
          :model-value="submissionUID || null"
          label="Einreichung"
          required
          :options="submissionOptions"
          @update:model-value="submissionUID = $event ?? ''"
        />
        <EuTextField v-model="billingNumber" label="Abrechnungsnummer" />
        <EuTextField v-model="billingDate" label="Abrechnungsdatum" type="date" />
        <EuTextField v-model="documentLink" label="Dokument-Link (optional)" />

        <fieldset class="eu-newbill__invoices">
          <legend>Erstattung je Rechnung</legend>
          <p v-if="submissionInvoices.length === 0" class="eu-form__note">
            Diese Einreichung enthält keine Rechnungen.
          </p>
          <div v-for="inv in submissionInvoices" :key="inv.invoiceUID" class="eu-newbill__row">
            <label :for="`reimb-${inv.invoiceUID}`" class="eu-newbill__invoice">
              {{ inv.invoiceNumber }} · {{ euro(inv.invoiceAmount) }}
            </label>
            <input
              :id="`reimb-${inv.invoiceUID}`"
              v-model="reimbursements[inv.invoiceUID]"
              class="eu-newbill__amount"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              placeholder="Erstattung €"
            />
          </div>
        </fieldset>
      </template>

      <p v-if="error" class="eu-form__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="busy || loading || submissions.length === 0" @click="save">
        {{ busy ? 'Speichern…' : 'Speichern' }}
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

.eu-newbill__invoices {
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
}

.eu-newbill__invoices legend {
  padding: 0 0.4rem;
  font-family: var(--eu-font-data);
  color: var(--eu-color-text-muted);
}

.eu-newbill__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.eu-newbill__invoice {
  font-family: var(--eu-font-data);
}

.eu-newbill__amount {
  width: 9rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375rem;
  background-color: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
  font: inherit;
}

.eu-newbill__amount:focus-visible {
  outline: 2px solid var(--eu-color-focus-ring);
  outline-offset: 1px;
}
</style>
