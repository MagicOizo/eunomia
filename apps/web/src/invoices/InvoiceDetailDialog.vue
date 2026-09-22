<script setup lang="ts">
import { faBan, faPaperPlane, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { describeError } from '../lib/errors';
import { euro } from '../lib/format';
import {
  type InvoiceAllocationDto,
  type InvoiceDto,
  type InvoiceExclusionDto,
  type InvoiceSubmissionDto,
  type PlanInvoiceDto,
  addExclusion,
  createSubmission,
  deleteAllocation,
  removeExclusion,
  withdrawSubmission,
} from './api';
import { type BillingAllocationPayload, saveBillingAllocation } from './billing-actions';
import BillingDialog from './BillingDialog.vue';
import { submittableContracts } from './eligibility';
import ExclusionDialog from './ExclusionDialog.vue';
import ObjectionDialog from './ObjectionDialog.vue';
import SubmissionCard from './SubmissionCard.vue';
import SubmitDialog from './SubmitDialog.vue';
import { STATUS_DISPLAY } from './status';

/**
 * View/edit an invoice as a compact display mask (see dialog-design.md): three
 * columns of Label | value | per-field clear/reset, borders only on
 * hover/focus. Distinct from the create form (InvoiceFormDialog). Derived
 * values (status, insured person, IBAN of the selected agency, reimbursement)
 * are read-only rows. Saving sends the full field set as a PATCH.
 *
 * Below the mask, the "Zuordnung" block: one card per policy the invoice was
 * submitted to (with its billings and the optimizer's advice) and one per "not
 * reimbursable under" mark. Their actions — submit, bill, object, withdraw,
 * remove — act immediately through their own API calls and report back with
 * `changed`, independent of the mask's Save.
 */
const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
  accountName: string;
  facilities: SelectOption[];
  agencies: SelectOption[];
  /** agencyUID → IBAN, to show the read-only IBAN of the picked agency. */
  agencyIban: Record<string, string>;
  /** All policies of the insured person, for the submit and exclusion pickers. */
  contracts: SelectOption[];
  /** The optimizer's advice for this invoice, shown per policy card. */
  planInvoice: PlanInvoiceDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: Record<string, unknown>];
  /** A submission or exclusion changed: the parent reloads and passes the fresh invoice. */
  changed: [];
}>();

const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
const localError = ref<string | null>(null);

// Seeded per opened invoice only: a reload after a block action passes a
// fresh invoice object and must not discard unsaved edits in the mask.
watch(
  () => [props.open, props.invoice?.invoiceUID] as const,
  ([open]) => {
    const inv = props.invoice;
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
      reimbursementClosed: inv.reimbursementClosed,
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
const isSubmitted = computed(() => (props.invoice?.submissions.length ?? 0) > 0);

// --- "Zuordnung" block: submissions, their billings and the exclusions ---
const blockBusy = ref(false);
const blockError = ref<string | null>(null);
const exclusionOpen = ref(false);
const exclusionError = ref<string | null>(null);
const submitOpen = ref(false);
const submitError = ref<string | null>(null);
const billingOpen = ref(false);
const billingError = ref<string | null>(null);
const billingSubmission = ref<InvoiceSubmissionDto | null>(null);
const objectionOpen = ref(false);
const pendingWithdraw = ref<InvoiceSubmissionDto | null>(null);
const pendingRemove = ref<InvoiceExclusionDto | null>(null);
const pendingAllocation = ref<InvoiceAllocationDto | null>(null);

watch(
  () => [props.open, props.invoice?.invoiceUID] as const,
  () => (blockError.value = null),
);

const policyLabel = (p: { contractNumber: string; companyName: string }): string =>
  `${p.contractNumber} · ${p.companyName}`;

/** Policies that can still be marked: not submitted there and not marked yet. */
const markableContracts = computed(() => {
  const inv = props.invoice;
  if (!inv) return [];
  const taken = new Set([
    ...inv.submissions.map((s) => s.contractUID),
    ...inv.exclusions.map((x) => x.contractUID),
  ]);
  return props.contracts.filter((c) => !taken.has(c.value));
});

/** Policies the invoice can still go to (mirrors the API's checks). */
const openContracts = computed(() =>
  props.invoice ? submittableContracts(props.invoice, props.contracts) : [],
);

/** contractUID → what the optimizer advises for this invoice at that policy. */
const planActions = computed(
  () => new Map((props.planInvoice?.policies ?? []).map((p) => [p.contractUID, p.action])),
);

async function runBlock(
  action: () => Promise<unknown>,
  onError: (m: string) => void,
  conflict?: string,
) {
  blockBusy.value = true;
  try {
    await action();
    emit('changed');
    return true;
  } catch (error) {
    onError(describeError(error, conflict));
    return false;
  } finally {
    blockBusy.value = false;
  }
}

async function confirmWithdraw(): Promise<void> {
  const inv = props.invoice;
  const submission = pendingWithdraw.value;
  if (!inv || !submission) return;
  blockError.value = null;
  await runBlock(
    () => withdrawSubmission(submission.submissionUID, inv.invoiceUID),
    (m) => (blockError.value = m),
    'Zu dieser Einreichung gibt es bereits eine Leistungsabrechnung, sie kann nicht mehr zurückgezogen werden.',
  );
  pendingWithdraw.value = null;
}

async function saveSubmission(payload: {
  contractUID: string;
  submittedDate: string;
}): Promise<void> {
  const inv = props.invoice;
  if (!inv) return;
  submitError.value = null;
  const ok = await runBlock(
    () => createSubmission({ ...payload, invoiceUIDs: [inv.invoiceUID] }),
    (m) => (submitError.value = m),
    'Die Rechnung liegt bei dieser Police bereits, ist dort als nicht erstattungsfähig markiert oder schon abgerechnet.',
  );
  if (ok) submitOpen.value = false;
}

function openBilling(submission: InvoiceSubmissionDto): void {
  billingSubmission.value = submission;
  billingError.value = null;
  billingOpen.value = true;
}

async function saveBilling(payload: BillingAllocationPayload): Promise<void> {
  const inv = props.invoice;
  if (!inv) return;
  billingError.value = null;
  const ok = await runBlock(
    () => saveBillingAllocation(inv.invoiceUID, payload),
    (m) => (billingError.value = m),
    `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen (noch offen: ${euro(inv.remainingAmount)}).`,
  );
  if (ok) billingOpen.value = false;
}

async function confirmRemoveAllocation(): Promise<void> {
  const allocation = pendingAllocation.value;
  if (!allocation) return;
  blockError.value = null;
  await runBlock(
    () => deleteAllocation(allocation.allocationUID),
    (m) => (blockError.value = m),
  );
  pendingAllocation.value = null;
}

async function saveExclusion(payload: { contractUID: string; note: string | null }): Promise<void> {
  const inv = props.invoice;
  if (!inv) return;
  exclusionError.value = null;
  const ok = await runBlock(
    () => addExclusion(inv.invoiceUID, payload),
    (m) => (exclusionError.value = m),
    'Bei dieser Police ist die Rechnung bereits eingereicht oder schon markiert.',
  );
  if (ok) exclusionOpen.value = false;
}

async function confirmRemove(): Promise<void> {
  const inv = props.invoice;
  const exclusion = pendingRemove.value;
  if (!inv || !exclusion) return;
  blockError.value = null;
  await runBlock(
    () => removeExclusion(inv.invoiceUID, exclusion.contractUID),
    (m) => (blockError.value = m),
  );
  pendingRemove.value = null;
}

function submit(): void {
  localError.value = null;
  if (!props.invoice) return;
  if (
    !str(values.invoiceNumber) ||
    !values.invoiceDate ||
    !values.treatmentDate ||
    values.invoiceAmount === null
  ) {
    localError.value =
      'Bitte Rechnungsnummer, Rechnungsdatum, Behandlungsdatum und Betrag ausfüllen.';
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
    // The "billed" mark only exists for submitted invoices (the API rejects it otherwise).
    ...(isSubmitted.value ? { reimbursementClosed: values.reimbursementClosed === true } : {}),
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

      <!-- Zuordnungsblock (Karten je Leistungsabrechnung): Slice 21. -->

      <EuDetailField
        label="Erstattung"
        type="readonly"
        :model-value="euro(invoice.reimbursedTotal)"
      />
      <template v-if="isSubmitted">
        <EuDetailField
          label="Noch nicht erstattet"
          type="readonly"
          :model-value="euro(invoice.remainingAmount)"
        />
        <EuDetailField
          v-model="values.reimbursementClosed"
          :saved-value="saved.reimbursementClosed"
          label="Als abgerechnet markiert"
          type="toggle"
        />
      </template>
    </div>

    <p v-if="error ?? localError" class="eu-detail-grid__error" role="alert">
      {{ error ?? localError }}
    </p>

    <template v-if="invoice">
      <section class="eu-detail-block" aria-labelledby="eu-invoice-assignment">
        <div class="eu-detail-block__head">
          <h3 id="eu-invoice-assignment">Zuordnung</h3>
          <div class="eu-detail-block__head-actions">
            <EuButton
              variant="secondary"
              :icon="faPaperPlane"
              :disabled="openContracts.length === 0 || blockBusy"
              @click="
                submitError = null;
                submitOpen = true;
              "
              >Einreichen</EuButton
            >
            <EuButton
              variant="secondary"
              :icon="faBan"
              :disabled="markableContracts.length === 0 || blockBusy"
              @click="
                exclusionError = null;
                exclusionOpen = true;
              "
              >Nicht erstattungsfähig</EuButton
            >
          </div>
        </div>

        <p
          v-if="invoice.submissions.length === 0 && invoice.exclusions.length === 0"
          class="eu-detail-block__hint"
        >
          Noch bei keiner Police eingereicht oder markiert.
        </p>
        <div v-else class="eu-detail-block__cards">
          <SubmissionCard
            v-for="submission in invoice.submissions"
            :key="submission.submissionUID"
            :submission="submission"
            :plan-action="planActions.get(submission.contractUID) ?? null"
            :closed="invoice.reimbursementClosed"
            :busy="blockBusy"
            @bill="openBilling"
            @objection="objectionOpen = true"
            @withdraw="pendingWithdraw = $event"
            @remove-allocation="pendingAllocation = $event"
          />
          <article
            v-for="exclusion in invoice.exclusions"
            :key="exclusion.contractUID"
            class="eu-detail-block__excl"
          >
            <div>
              <h4>{{ policyLabel(exclusion) }}</h4>
              <p>{{ exclusion.note ?? 'Nicht erstattungsfähig bei dieser Police.' }}</p>
            </div>
            <EuBadge tone="neutral" :icon="faBan">Nicht erstattungsfähig</EuBadge>
            <EuButton
              variant="secondary"
              icon-only
              :icon="faTrash"
              :aria-label="`Markierung für ${exclusion.contractNumber} entfernen`"
              :title="`Markierung für ${exclusion.contractNumber} entfernen`"
              :disabled="blockBusy"
              @click="pendingRemove = exclusion"
            />
          </article>
        </div>
      </section>
      <p v-if="blockError" class="eu-detail-grid__error" role="alert">{{ blockError }}</p>
    </template>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>

  <SubmitDialog
    :open="submitOpen"
    :count="1"
    :contracts="openContracts"
    :submitting="blockBusy"
    :error="submitError"
    @close="submitOpen = false"
    @submit="saveSubmission"
  />
  <BillingDialog
    :open="billingOpen"
    :invoice="invoice"
    :preset-submission="billingSubmission?.submissionUID ?? null"
    :submitting="blockBusy"
    :error="billingError"
    @close="billingOpen = false"
    @submit="saveBilling"
  />
  <ObjectionDialog
    :open="objectionOpen"
    :invoice="invoice"
    @close="objectionOpen = false"
    @changed="emit('changed')"
  />
  <ExclusionDialog
    :open="exclusionOpen"
    :contracts="markableContracts"
    :submitting="blockBusy"
    :error="exclusionError"
    @close="exclusionOpen = false"
    @submit="saveExclusion"
  />
  <EuDialog
    :open="pendingWithdraw !== null"
    title="Einreichung zurückziehen"
    @close="pendingWithdraw = null"
  >
    <p>
      Die Einreichung bei {{ pendingWithdraw ? policyLabel(pendingWithdraw) : '' }} wirklich
      zurückziehen? Die Rechnung kann danach erneut bei dieser Police eingereicht werden.
    </p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingWithdraw = null">Abbrechen</EuButton>
      <EuButton :disabled="blockBusy" @click="confirmWithdraw">Zurückziehen</EuButton>
    </template>
  </EuDialog>
  <EuDialog
    :open="pendingAllocation !== null"
    title="Erstattung entfernen"
    @close="pendingAllocation = null"
  >
    <p v-if="pendingAllocation">
      Die Erstattung von {{ euro(pendingAllocation.reimbursement) }} aus Abrechnung
      {{ pendingAllocation.billingNumber }} wirklich entfernen? Die Leistungsabrechnung selbst
      bleibt bestehen.
    </p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingAllocation = null">Abbrechen</EuButton>
      <EuButton :disabled="blockBusy" @click="confirmRemoveAllocation">Entfernen</EuButton>
    </template>
  </EuDialog>
  <EuDialog
    :open="pendingRemove !== null"
    title="Markierung entfernen"
    @close="pendingRemove = null"
  >
    <p>
      Die Markierung „nicht erstattungsfähig“ für
      {{ pendingRemove ? policyLabel(pendingRemove) : '' }} entfernen?
    </p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingRemove = null">Abbrechen</EuButton>
      <EuButton :disabled="blockBusy" @click="confirmRemove">Entfernen</EuButton>
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

.eu-detail-block {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-detail-block__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.eu-detail-block__head h3 {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1.05rem;
}

.eu-detail-block__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-detail-block__head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.eu-detail-block__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: 0.75rem;
}

/* A mark is not a submission: flatter and muted, so the cards that carry
   money stay the ones that stand out. */
.eu-detail-block__excl {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border: 1px dashed var(--eu-color-border);
  border-radius: 0.6rem;
  font-family: var(--eu-font-data);
}

.eu-detail-block__excl h4 {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1rem;
}

.eu-detail-block__excl p {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
}

.eu-detail-block__excl > div {
  flex: 1;
  min-width: 0;
}
</style>
