<script setup lang="ts">
import {
  faChevronLeft,
  faCircleCheck,
  faFileInvoiceDollar,
  faPaperPlane,
  faPen,
  faPlus,
  faTrash,
  faTriangleExclamation,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, ref, watch, watchEffect } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { apiFetch } from '../lib/api';
import { euro, germanDate, plural } from '../lib/format';
import { describeError } from '../lib/errors';
import { listResource } from '../lib/resource';
import { useTableSort } from '../lib/useTableSort';
import {
  type InvoiceDto,
  type ReimbursementPlanDto,
  createInvoice,
  createSubmission,
  deleteInvoice,
  listInvoiceYears,
  listInvoices,
  reimbursementPlan,
  updateInvoice,
} from './api';
import { type BillingAllocationPayload, saveBillingAllocations } from './billing-actions';
import BillingDialog from './BillingDialog.vue';
import { commonSubmissions, commonSubmittableContracts, submittableContracts } from './eligibility';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';
import InvoiceBriefList from './InvoiceBriefList.vue';
import InvoiceFormDialog from './InvoiceFormDialog.vue';
import InvoiceSummary from './InvoiceSummary.vue';
import PaymentInfoPopover from './PaymentInfoPopover.vue';
import RecommendationBadge from './RecommendationBadge.vue';
import { type InvoiceBadgeView, invoiceBadge } from './recommendation';
import SettleDialog from './SettleDialog.vue';
import SubmitDialog from './SubmitDialog.vue';
import { PAYMENT_COLOR_VAR, PAYMENT_DISPLAY, calcPaymentState } from './payment';
import { STATUS_DISPLAY, STATUS_ORDER } from './status';

const props = defineProps<{ accountUID: string }>();

interface ContractRef {
  contractUID: string;
  contractNumber: string;
  companyName: string;
}

/** "Nummer · Versicherung" — tells a person's full and supplementary policy apart. */
const contractLabel = (c: ContractRef): string => `${c.contractNumber} · ${c.companyName}`;

const accountName = ref('');
const years = ref<number[]>([]);
const activeYear = ref(new Date().getFullYear());
const invoices = ref<InvoiceDto[]>([]);
const contracts = ref<ContractRef[]>([]);
const facilityOptions = ref<SelectOption[]>([]);
const facilityNameById = ref<Map<string, string>>(new Map());
const agencyOptions = ref<SelectOption[]>([]);
const agencyById = ref<Map<string, { name: string; bankAccount: string }>>(new Map());
const agencyIbanMap = computed(() =>
  Object.fromEntries([...agencyById.value].map(([uid, a]) => [uid, a.bankAccount])),
);
/** facilityUID → name, for the invoice lists of the dialogs. */
const facilityNameMap = computed(() => Object.fromEntries(facilityNameById.value));
/** The facility's name for one invoice, or null when it has none. */
const facilityName = (invoice: InvoiceDto): string | null =>
  invoice.facilityUID ? (facilityNameById.value.get(invoice.facilityUID) ?? null) : null;
const plan = ref<ReimbursementPlanDto | null>(null);
/** The optimizer's advice per invoice; invoices with nothing to do have no entry. */
const recommendationBadges = computed(() => {
  const policies = new Map((plan.value?.policies ?? []).map((p) => [p.contractUID, p]));
  const badges = new Map<string, InvoiceBadgeView>();
  for (const invoicePlan of plan.value?.invoices ?? []) {
    const badge = invoiceBadge(invoicePlan, policies);
    if (badge) badges.set(invoicePlan.invoiceUID, badge);
  }
  return badges;
});
const selected = ref<Set<string>>(new Set());

const loading = ref(false);
const loadError = ref<string | null>(null);

const formOpen = ref(false);
const detailOpen = ref(false);
const editing = ref<InvoiceDto | null>(null);
const submitOpen = ref(false);
const submitTargets = ref<InvoiceDto[]>([]);
const billingOpen = ref(false);
const billingTargets = ref<InvoiceDto[]>([]);
const settleOpen = ref(false);
const dialogInvoice = ref<InvoiceDto | null>(null);
const dialogBusy = ref(false);
const dialogError = ref<string | null>(null);
const deleteTargets = ref<string[]>([]);

const contractOptions = computed<SelectOption[]>(() =>
  contracts.value.map((c) => ({ value: c.contractUID, label: contractLabel(c) })),
);
/** Policies all invoices of the submit dialog can still go to. */
const submitContractOptions = computed(() =>
  commonSubmittableContracts(submitTargets.value, contractOptions.value),
);
const canSubmit = (invoice: InvoiceDto): boolean =>
  submittableContracts(invoice, contractOptions.value).length > 0;

// Selection derived state. Every row is selectable; the global buttons enable
// based on what is selected (submit only acts on invoices that can still go
// to some policy; the dialog offers the policies they have in common).
const selectedSubmittable = computed(() =>
  invoices.value.filter((i) => selected.value.has(i.invoiceUID) && canSubmit(i)),
);
const selectedInvoices = computed(() =>
  invoices.value.filter((i) => selected.value.has(i.invoiceUID)),
);
/**
 * One Leistungsabrechnung only reimburses invoices of its own submission, so
 * booking several at once needs a submission they all belong to.
 */
const selectedBookable = computed(() =>
  commonSubmissions(selectedInvoices.value).length > 0 ? selectedInvoices.value : [],
);
const allSelected = computed(
  () => invoices.value.length > 0 && selected.value.size === invoices.value.length,
);
const someSelected = computed(() => selected.value.size > 0 && !allSelected.value);

const selectAllEl = ref<HTMLInputElement | null>(null);
watchEffect(() => {
  if (selectAllEl.value) selectAllEl.value.indeterminate = someSelected.value;
});

function invoiceSortValue(inv: InvoiceDto, key: string): string | number {
  switch (key) {
    case 'status':
      return STATUS_ORDER.indexOf(inv.workflowStatus); // sort by workflow order, not label
    case 'invoiceDate':
      return inv.invoiceDate;
    case 'treatmentDate':
      return inv.treatmentDate;
    case 'number':
      return inv.invoiceNumber;
    case 'facility':
      return facilityName(inv) ?? '';
    case 'amount':
      return inv.invoiceAmount;
    case 'reimbursed':
      return inv.reimbursedTotal;
    default:
      return '';
  }
}
const sort = useTableSort(invoices, invoiceSortValue);

/** Loads the account-level data that does not depend on the selected year. */
async function loadStatic(): Promise<void> {
  const account = await apiFetch<{ data: { firstname: string; surname: string | null } }>(
    `/accounts/${props.accountUID}`,
  );
  accountName.value = [account.data.firstname, account.data.surname].filter(Boolean).join(' ');

  const allContracts = await listResource<ContractRef & { accountUID: string }>('/contracts');
  contracts.value = allContracts
    .filter((c) => c.accountUID === props.accountUID)
    .map((c) => ({
      contractUID: c.contractUID,
      contractNumber: c.contractNumber,
      companyName: c.companyName,
    }));

  const facilities = await listResource<{ facilityUID: string; facilityName: string }>(
    '/facilities',
  );
  facilityOptions.value = facilities.map((f) => ({ value: f.facilityUID, label: f.facilityName }));
  facilityNameById.value = new Map(facilities.map((f) => [f.facilityUID, f.facilityName]));

  const agencies = await listResource<{
    agencyUID: string;
    agencyName: string;
    bankAccount: string;
  }>('/agencies');
  agencyOptions.value = agencies.map((a) => ({ value: a.agencyUID, label: a.agencyName }));
  agencyById.value = new Map(
    agencies.map((a) => [a.agencyUID, { name: a.agencyName, bankAccount: a.bankAccount }]),
  );
}

/** Payment-status traffic light for a row: icon, colour and label in one bundle. */
function paymentView(invoice: InvoiceDto) {
  const state = calcPaymentState(invoice);
  return {
    icon: PAYMENT_DISPLAY[state].icon,
    color: `var(${PAYMENT_COLOR_VAR[state]})`,
    label: PAYMENT_DISPLAY[state].label,
  };
}

async function loadYearData(): Promise<void> {
  selected.value = new Set();
  invoices.value = await listInvoices(props.accountUID, activeYear.value);
  plan.value = await reimbursementPlan(props.accountUID, activeYear.value);
}

async function refreshYears(): Promise<void> {
  const found = await listInvoiceYears(props.accountUID);
  years.value = found.length > 0 ? found : [new Date().getFullYear()];
  if (!years.value.includes(activeYear.value)) activeYear.value = years.value[0];
}

async function init(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await loadStatic();
    await refreshYears();
    await loadYearData();
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

async function afterMutation(): Promise<void> {
  await refreshYears();
  await loadYearData();
}

watch(() => props.accountUID, init, { immediate: true });

async function selectYear(year: number): Promise<void> {
  activeYear.value = year;
  loading.value = true;
  try {
    await loadYearData();
  } finally {
    loading.value = false;
  }
}

function toggleSelect(invoice: InvoiceDto): void {
  const next = new Set(selected.value);
  if (next.has(invoice.invoiceUID)) next.delete(invoice.invoiceUID);
  else next.add(invoice.invoiceUID);
  selected.value = next;
}

function toggleSelectAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(invoices.value.map((i) => i.invoiceUID));
}

// --- dialog openers ---
function openCreate(): void {
  editing.value = null;
  dialogError.value = null;
  formOpen.value = true;
}
// Editing opens the display-mask detail dialog; creating keeps the classic form.
function openEdit(invoice: InvoiceDto): void {
  dialogInvoice.value = invoice;
  dialogError.value = null;
  detailOpen.value = true;
}
function submitDetail(payload: Record<string, unknown>): void {
  const invoice = dialogInvoice.value;
  if (!invoice) return;
  void runDialog(
    () => updateInvoice(invoice.invoiceUID, payload).then(() => undefined),
    () => (detailOpen.value = false),
    'Der Rechnungsbetrag kann nicht unter die bereits erstatteten Beträge sinken.',
  );
}
function openSubmit(targets: InvoiceDto[]): void {
  submitTargets.value = targets;
  dialogError.value = null;
  submitOpen.value = true;
}
function openBilling(targets: InvoiceDto[]): void {
  billingTargets.value = targets;
  dialogError.value = null;
  billingOpen.value = true;
}
function openSettle(invoice: InvoiceDto): void {
  dialogInvoice.value = invoice;
  dialogError.value = null;
  settleOpen.value = true;
}
/** The optimizer's advice for the invoice the detail dialog shows. */
const detailPlan = computed(
  () => plan.value?.invoices.find((i) => i.invoiceUID === dialogInvoice.value?.invoiceUID) ?? null,
);

/** Detail dialog blocks changed something: reload and hand it the fresh invoice. */
async function detailChanged(): Promise<void> {
  const uid = dialogInvoice.value?.invoiceUID;
  await afterMutation();
  dialogInvoice.value = invoices.value.find((i) => i.invoiceUID === uid) ?? dialogInvoice.value;
}
/** The invoices behind the pending delete, for the confirmation's list. */
const deleteInvoices = computed(() =>
  invoices.value.filter((i) => deleteTargets.value.includes(i.invoiceUID)),
);

function openDelete(uids: string[]): void {
  deleteTargets.value = uids;
  dialogError.value = null;
}

/**
 * Wraps a dialog action with busy/error handling and a reload on success.
 * `conflictMessage` explains a 409 in the dialog's own terms.
 */
async function runDialog(
  action: () => Promise<void>,
  close: () => void,
  conflictMessage?: string,
): Promise<void> {
  dialogBusy.value = true;
  dialogError.value = null;
  try {
    await action();
    close();
    await afterMutation();
  } catch (error) {
    dialogError.value = describeError(error, conflictMessage);
  } finally {
    dialogBusy.value = false;
  }
}

function submitInvoiceForm(payload: Record<string, unknown>): void {
  void runDialog(
    async () => {
      if (editing.value) await updateInvoice(editing.value.invoiceUID, payload);
      else await createInvoice(payload);
    },
    () => (formOpen.value = false),
  );
}

function submitSubmission(payload: { contractUID: string; submittedDate: string }): void {
  const invoiceUIDs = submitTargets.value.map((i) => i.invoiceUID);
  void runDialog(
    () => createSubmission({ ...payload, invoiceUIDs }).then(() => undefined),
    () => (submitOpen.value = false),
  );
}

function submitBilling(payload: BillingAllocationPayload): void {
  void runDialog(
    () => saveBillingAllocations(payload),
    () => (billingOpen.value = false),
  );
}

function submitSettle(transferDate: string): void {
  const invoice = dialogInvoice.value;
  if (!invoice) return;
  void runDialog(
    () => updateInvoice(invoice.invoiceUID, { transferDate }).then(() => undefined),
    () => (settleOpen.value = false),
  );
}

function openDocument(invoice: InvoiceDto): void {
  if (invoice.documentLink) window.open(invoice.documentLink, '_blank', 'noopener');
}

function confirmDelete(): void {
  const uids = deleteTargets.value;
  if (uids.length === 0) return;
  void runDialog(
    () => Promise.all(uids.map((uid) => deleteInvoice(uid))).then(() => undefined),
    () => (deleteTargets.value = []),
  );
}
</script>

<template>
  <section>
    <div class="eu-ws__head">
      <RouterLink
        to="/invoices"
        class="eu-ws__back"
        title="Zurück zur Konten-Auswahl"
        aria-label="Zurück zur Konten-Auswahl"
      >
        <FontAwesomeIcon :icon="faChevronLeft" aria-hidden="true" />
      </RouterLink>
      <h2 class="eu-ws__title">{{ accountName }}</h2>
    </div>

    <div class="eu-ws__toolbar">
      <EuButton :icon="faPlus" @click="openCreate">Neue Rechnung</EuButton>
      <EuButton
        :icon="faPaperPlane"
        variant="secondary"
        :disabled="selectedSubmittable.length === 0"
        @click="openSubmit(selectedSubmittable)"
      >
        Einreichen ({{ selectedSubmittable.length }})
      </EuButton>
      <EuButton
        :icon="faFileInvoiceDollar"
        variant="secondary"
        :disabled="selectedBookable.length === 0"
        @click="openBilling(selectedBookable)"
      >
        Abrechnung zuordnen ({{ selectedBookable.length }})
      </EuButton>
      <EuButton
        :icon="faTrash"
        variant="secondary"
        :disabled="selected.size === 0"
        @click="openDelete(Array.from(selected))"
      >
        Löschen ({{ selected.size }})
      </EuButton>
    </div>

    <div v-if="years.length > 1" class="eu-ws__years" role="tablist" aria-label="Behandlungsjahr">
      <button
        v-for="year in years"
        :key="year"
        type="button"
        role="tab"
        :aria-selected="year === activeYear"
        class="eu-ws__year"
        :class="{ 'is-active': year === activeYear }"
        @click="selectYear(year)"
      >
        {{ year }}
      </button>
    </div>

    <p v-if="loading" class="eu-ws__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-ws__error" role="alert">{{ loadError }}</p>
    <p v-else-if="invoices.length === 0" class="eu-ws__hint">
      Keine Rechnungen für {{ activeYear }}.
    </p>

    <div v-else class="eu-ws__table-wrap eu-scroll-focus-safe">
      <table class="eu-ws__table">
        <thead>
          <tr>
            <th>
              <input
                ref="selectAllEl"
                type="checkbox"
                aria-label="Alle auswählen"
                :checked="allSelected"
                @change="toggleSelectAll"
              />
            </th>
            <EuSortableTh
              label="Status"
              :state="sort.stateOf('status')"
              @sort="sort.toggle('status')"
            />
            <EuSortableTh
              label="Rechnungsdatum"
              :state="sort.stateOf('invoiceDate')"
              @sort="sort.toggle('invoiceDate')"
            />
            <EuSortableTh
              label="Behandlung"
              :state="sort.stateOf('treatmentDate')"
              @sort="sort.toggle('treatmentDate')"
            />
            <EuSortableTh
              label="Nummer"
              :state="sort.stateOf('number')"
              @sort="sort.toggle('number')"
            />
            <EuSortableTh
              label="Leistungserbringer"
              :state="sort.stateOf('facility')"
              @sort="sort.toggle('facility')"
            />
            <EuSortableTh
              label="Betrag"
              align="center"
              :state="sort.stateOf('amount')"
              @sort="sort.toggle('amount')"
            />
            <EuSortableTh
              label="Erstattung"
              align="center"
              :state="sort.stateOf('reimbursed')"
              @sort="sort.toggle('reimbursed')"
            />
            <th class="eu-ws__actions-head">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invoice in sort.sorted" :key="invoice.invoiceUID">
            <td>
              <input
                type="checkbox"
                :aria-label="`Rechnung ${invoice.invoiceNumber} auswählen`"
                :checked="selected.has(invoice.invoiceUID)"
                @change="toggleSelect(invoice)"
              />
            </td>
            <td>
              <div class="eu-ws__badges">
                <EuBadge
                  :tone="STATUS_DISPLAY[invoice.workflowStatus].tone"
                  :icon="STATUS_DISPLAY[invoice.workflowStatus].icon"
                >
                  {{ STATUS_DISPLAY[invoice.workflowStatus].label }}
                </EuBadge>
                <span
                  v-if="invoice.hasOpenObjection"
                  class="eu-ws__objection"
                  role="img"
                  aria-label="Im Widerspruch"
                  title="Im Widerspruch"
                >
                  <FontAwesomeIcon :icon="faTriangleExclamation" aria-hidden="true" />
                </span>
                <RecommendationBadge
                  v-if="recommendationBadges.has(invoice.invoiceUID)"
                  :badge="recommendationBadges.get(invoice.invoiceUID)!"
                />
              </div>
            </td>
            <td>{{ germanDate(invoice.invoiceDate) }}</td>
            <td>{{ germanDate(invoice.treatmentDate) }}</td>
            <td>{{ invoice.invoiceNumber }}</td>
            <td class="eu-ws__facility" :title="facilityName(invoice) ?? undefined">
              {{ facilityName(invoice) ?? '–' }}
            </td>
            <td>
              <div class="eu-ws__amount">
                <span>{{ euro(invoice.invoiceAmount) }}</span>
                <PaymentInfoPopover
                  :invoice="invoice"
                  :facility-name="facilityName(invoice)"
                  :agency-name="
                    invoice.agencyUID ? (agencyById.get(invoice.agencyUID)?.name ?? null) : null
                  "
                  :bank-account="
                    invoice.agencyUID
                      ? (agencyById.get(invoice.agencyUID)?.bankAccount ?? null)
                      : null
                  "
                >
                  <template #trigger="{ expanded, panelId }">
                    <button
                      type="button"
                      class="eu-ws__ampel"
                      :style="{ color: paymentView(invoice).color }"
                      :aria-label="`${paymentView(invoice).label} – Zahlungsinformationen anzeigen`"
                      :title="`${paymentView(invoice).label} – Zahlungsinformationen anzeigen`"
                      :aria-expanded="expanded"
                      :aria-controls="panelId"
                    >
                      <FontAwesomeIcon :icon="paymentView(invoice).icon" aria-hidden="true" />
                    </button>
                  </template>
                </PaymentInfoPopover>
              </div>
            </td>
            <td class="eu-ws__num">{{ euro(invoice.reimbursedTotal) }}</td>
            <td class="eu-ws__actions">
              <EuButton
                v-if="invoice.documentLink"
                variant="secondary"
                icon-only
                :icon="faUpRightFromSquare"
                aria-label="Dokument öffnen"
                title="Hinterlegtes Dokument öffnen"
                @click="openDocument(invoice)"
              />
              <EuButton
                v-if="canSubmit(invoice) && invoice.workflowStatus === 'offen'"
                variant="secondary"
                icon-only
                :icon="faPaperPlane"
                aria-label="Einreichen"
                title="Rechnung bei der Versicherung einreichen"
                @click="openSubmit([invoice])"
              />
              <EuButton
                v-if="invoice.workflowStatus !== 'offen' && invoice.transferDate === null"
                variant="secondary"
                icon-only
                :icon="faCircleCheck"
                aria-label="Als bezahlt markieren"
                title="Rechnung als bezahlt markieren"
                @click="openSettle(invoice)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faPen"
                aria-label="Details"
                title="Rechnungsdetails öffnen – bearbeiten, einreichen, abrechnen"
                @click="openEdit(invoice)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faTrash"
                aria-label="Löschen"
                title="Rechnung löschen"
                @click="openDelete([invoice.invoiceUID])"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <InvoiceSummary
      v-if="!loading && !loadError && invoices.length > 0"
      :invoices="invoices"
      :plan="plan"
    />

    <InvoiceDetailDialog
      :open="detailOpen"
      :invoice="dialogInvoice"
      :account-name="accountName"
      :facilities="facilityOptions"
      :agencies="agencyOptions"
      :agency-iban="agencyIbanMap"
      :contracts="contractOptions"
      :plan-invoice="detailPlan"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="detailOpen = false"
      @submit="submitDetail"
      @changed="detailChanged"
    />
    <InvoiceFormDialog
      :open="formOpen"
      :editing="editing"
      :account-u-i-d="accountUID"
      :facilities="facilityOptions"
      :agencies="agencyOptions"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="formOpen = false"
      @submit="submitInvoiceForm"
    />
    <SubmitDialog
      :open="submitOpen"
      :invoices="submitTargets"
      :facility-names="facilityNameMap"
      :contracts="submitContractOptions"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="submitOpen = false"
      @submit="submitSubmission"
    />
    <BillingDialog
      :open="billingOpen"
      :invoices="billingTargets"
      :facility-names="facilityNameMap"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="billingOpen = false"
      @submit="submitBilling"
    />
    <SettleDialog
      :open="settleOpen"
      :invoice="dialogInvoice"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="settleOpen = false"
      @submit="submitSettle"
    />
    <EuDialog :open="deleteTargets.length > 0" title="Rechnung löschen" @close="deleteTargets = []">
      <p>{{ plural(deleteTargets.length, 'Rechnung', 'Rechnungen') }} wirklich löschen?</p>
      <InvoiceBriefList :invoices="deleteInvoices" :facility-names="facilityNameMap" />
      <p v-if="dialogError" class="eu-ws__error" role="alert">{{ dialogError }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="deleteTargets = []">Abbrechen</EuButton>
        <EuButton :disabled="dialogBusy" @click="confirmDelete">Löschen</EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-ws__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 1rem;
}

.eu-ws__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: var(--eu-color-text-muted);
  text-decoration: none;
}
.eu-ws__back:hover {
  background-color: var(--eu-color-border);
  color: var(--eu-color-text);
}

.eu-ws__title {
  margin: 0;
  font-size: 1.4rem;
}

.eu-ws__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.eu-ws__years {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-ws__year {
  border: none;
  background: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-family: var(--eu-font-data);
  color: var(--eu-color-text-muted);
  border-bottom: 3px solid transparent;
}

.eu-ws__year.is-active {
  color: var(--eu-color-accent-text);
  border-bottom-color: var(--eu-color-accent);
  font-weight: 600;
}

.eu-ws__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}
.eu-ws__error {
  color: var(--eu-color-error-fg);
  font-family: var(--eu-font-data);
}

.eu-ws__table-wrap {
  overflow-x: auto;
}

.eu-ws__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-ws__table th,
.eu-ws__table td {
  padding: 0.55rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

/* Nine columns of nowrap data did not fit the card at 1440px and pushed the
   actions header out of sight. The headers are the widest part of three of
   those columns, so they — and only they — may break. */
.eu-ws__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: normal;
  hyphens: auto;
}

.eu-ws__table .eu-ws__facility {
  max-width: 13rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Shrink the actions column to its content so the data columns get the rest.
   Prefixed with the table class to outweigh the base `.eu-ws__table td` rule. */
.eu-ws__table .eu-ws__actions-head,
.eu-ws__table .eu-ws__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-ws__actions button + button {
  margin-left: 0.35rem;
}

.eu-ws__amount {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.eu-ws__table .eu-ws__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.eu-ws__badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

/* Objection marker: amber warning symbol; the label lives in its title
   tooltip (and accessible name), so it stays compact next to the status. */
.eu-ws__objection {
  color: var(--eu-color-status-submitted-fg);
  font-size: 1rem;
  cursor: help;
}

/* Combined payment-status light + info trigger. Colour is bound inline from the
   payment state; shape (the icon) and the title carry the state without relying
   on colour alone (WCAG 1.4.1). */
.eu-ws__ampel {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  border-radius: 0.25rem;
}

.eu-ws__ampel:focus-visible {
  outline: 2px solid var(--eu-color-focus-ring);
  outline-offset: 1px;
}
</style>
