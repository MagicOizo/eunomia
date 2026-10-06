<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { formatDate } from '../lib/format';
import { todayIso } from '../lib/date-input';
import { describeError } from '../lib/errors';
import { HttpError } from '../lib/http';
import { type BillingDto, type InvoiceDto, searchBillings, updateBilling } from './api';

const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
}>();

const emit = defineEmits<{
  close: [];
  /** A billing's objection state changed — parent reloads so the badge updates. */
  changed: [];
}>();

const { t } = useI18n();

const billings = ref<BillingDto[]>([]);
const loading = ref(false);
const busyUID = ref<string | null>(null);
const error = ref<string | null>(null);
/** Per-billing form state for filing a new objection. */
const forms = reactive<Record<string, { date: string; note: string }>>({});

function isOpen(billing: BillingDto): boolean {
  return billing.objectionDate !== null && billing.objectionResolvedDate === null;
}

/** "Policy · company" of the policy a billing belongs to. */
function policyOf(billing: BillingDto): string {
  const submission = props.invoice?.submissions.find((s) => s.contractUID === billing.contractUID);
  return submission ? `${submission.contractNumber} · ${submission.companyName}` : '';
}

async function load(): Promise<void> {
  const invoice = props.invoice;
  if (!invoice) return;
  loading.value = true;
  error.value = null;
  try {
    // An invoice can be billed by several policies. A billing belongs to the
    // policy and may answer other invoices too, so the policy's list is
    // narrowed to the billings that reimbursed *this* invoice — those are the
    // ones an objection is about.
    const booked = new Set(
      invoice.submissions.flatMap((s) => s.allocations.map((a) => a.billingUID)),
    );
    const lists = await Promise.all(
      invoice.submissions
        .filter((s) => s.billingCount > 0)
        .map((s) => searchBillings({ contractUID: s.contractUID })),
    );
    billings.value = lists.flat().filter((b) => booked.has(b.billingUID));
    for (const b of billings.value) {
      forms[b.billingUID] ??= { date: todayIso(), note: '' };
    }
  } catch (err) {
    error.value =
      err instanceof HttpError ? describeError(err) : t('invoices.objection.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

async function run(billingUID: string, action: () => Promise<unknown>): Promise<void> {
  busyUID.value = billingUID;
  error.value = null;
  try {
    await action();
    await load();
    emit('changed');
  } catch (err) {
    error.value = err instanceof HttpError ? describeError(err) : t('errors.actionFailed');
  } finally {
    busyUID.value = null;
  }
}

function file(billing: BillingDto): void {
  const form = forms[billing.billingUID];
  if (!form?.date) {
    error.value = t('invoices.objection.dateRequired');
    return;
  }
  void run(billing.billingUID, () =>
    updateBilling(billing.billingUID, {
      objectionDate: form.date,
      objectionResolvedDate: null,
      objectionNote: form.note.trim() ? form.note.trim() : null,
    }),
  );
}

function resolve(billing: BillingDto): void {
  void run(billing.billingUID, () =>
    updateBilling(billing.billingUID, { objectionResolvedDate: todayIso() }),
  );
}
</script>

<template>
  <EuDialog :open="open" :title="t('invoices.objection.title')" @close="emit('close')">
    <p v-if="invoice" class="eu-obj__lead">
      {{ t('invoices.objection.lead', { number: invoice.invoiceNumber }) }}
    </p>

    <p v-if="loading" class="eu-obj__hint">{{ t('common.loading') }}</p>
    <p v-else-if="billings.length === 0" class="eu-obj__hint">
      {{ t('invoices.objection.none') }}
    </p>

    <ul v-else class="eu-obj__list">
      <li v-for="billing in billings" :key="billing.billingUID" class="eu-obj__item">
        <div class="eu-obj__head">
          <strong>{{ billing.billingNumber }}</strong>
          <span class="eu-obj__date">{{ formatDate(billing.billingDate) }}</span>
        </div>
        <span class="eu-obj__date">{{ policyOf(billing) }}</span>

        <!-- Open objection: show it and offer to resolve. -->
        <template v-if="isOpen(billing)">
          <p class="eu-obj__state eu-obj__state--open">
            {{ t('invoices.objection.openSince', { date: formatDate(billing.objectionDate) }) }}
          </p>
          <p v-if="billing.objectionNote" class="eu-obj__note">{{ billing.objectionNote }}</p>
          <EuButton
            variant="secondary"
            :disabled="busyUID === billing.billingUID"
            @click="resolve(billing)"
          >
            {{ t('invoices.objection.resolve') }}
          </EuButton>
        </template>

        <!-- Resolved objection: history only. -->
        <template v-else-if="billing.objectionDate">
          <p class="eu-obj__state eu-obj__state--resolved">
            {{
              t('invoices.objection.resolvedOn', {
                date: formatDate(billing.objectionResolvedDate),
              })
            }}
          </p>
          <p v-if="billing.objectionNote" class="eu-obj__note">{{ billing.objectionNote }}</p>
        </template>

        <!-- No objection yet: file one. -->
        <template v-else>
          <div class="eu-obj__form">
            <EuTextField
              v-model="forms[billing.billingUID].date"
              :label="t('invoices.objection.date')"
              type="date"
            />
            <EuTextField
              v-model="forms[billing.billingUID].note"
              :label="t('invoices.objection.note')"
            />
          </div>
          <EuButton :disabled="busyUID === billing.billingUID" @click="file(billing)">
            {{ t('invoices.objection.file') }}
          </EuButton>
        </template>
      </li>
    </ul>

    <p v-if="error" class="eu-obj__error" role="alert">{{ error }}</p>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.close') }}</EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-obj__lead {
  margin: 0 0 1rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-obj__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-obj__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-obj__item {
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.eu-obj__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.eu-obj__date {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-obj__state {
  margin: 0;
  font-weight: 600;
}

.eu-obj__state--open {
  color: var(--eu-color-status-submitted-fg);
}

.eu-obj__state--resolved {
  color: var(--eu-color-status-done-fg);
}

.eu-obj__note {
  margin: 0;
  color: var(--eu-color-text-muted);
}

.eu-obj__form {
  display: flex;
  gap: 1rem;
}

.eu-obj__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
