<script setup lang="ts">
import {
  faChevronLeft,
  faCircleCheck,
  faFileCircleCheck,
  faGavel,
  faHandHoldingDollar,
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
import { euro, germanDate } from '../lib/format';
import { describeError } from '../lib/errors';
import { listResource } from '../lib/resource';
import { useTableSort } from '../lib/useTableSort';
import {
  type InvoiceDto,
  type ReimbursementAnalysisDto,
  createAllocation,
  createBilling,
  createInvoice,
  createSubmission,
  deleteInvoice,
  listInvoiceYears,
  listInvoices,
  reimbursementAnalysis,
  updateInvoice,
} from './api';
import BillingDialog from './BillingDialog.vue';
import {
  commonSubmittableContracts,
  submittableContracts,
  unbilledSubmissions,
} from './eligibility';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';
import InvoiceFormDialog from './InvoiceFormDialog.vue';
import InvoiceSummary from './InvoiceSummary.vue';
import ObjectionDialog from './ObjectionDialog.vue';
import PaymentInfoPopover from './PaymentInfoPopover.vue';
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
const analyses = ref<Array<{ label: string; analysis: ReimbursementAnalysisDto }>>([]);
const selected = ref<Set<string>>(new Set());

const loading = ref(false);
const loadError = ref<string | null>(null);

const formOpen = ref(false);
const detailOpen = ref(false);
const editing = ref<InvoiceDto | null>(null);
const submitOpen = ref(false);
const submitTargets = ref<InvoiceDto[]>([]);
const closeTarget = ref<InvoiceDto | null>(null);
const billingOpen = ref(false);
const objectionOpen = ref(false);
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
      return inv.facilityUID ? (facilityNameById.value.get(inv.facilityUID) ?? '') : '';
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
  analyses.value = await Promise.all(
    contracts.value.map(async (c) => ({
      label: contractLabel(c),
      analysis: await reimbursementAnalysis(c.contractUID, activeYear.value),
    })),
  );
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
function openBilling(invoice: InvoiceDto): void {
  dialogInvoice.value = invoice;
  dialogError.value = null;
  billingOpen.value = true;
}
function openObjection(invoice: InvoiceDto): void {
  dialogInvoice.value = invoice;
  objectionOpen.value = true;
}
function openSettle(invoice: InvoiceDto): void {
  dialogInvoice.value = invoice;
  dialogError.value = null;
  settleOpen.value = true;
}
function openClose(invoice: InvoiceDto): void {
  closeTarget.value = invoice;
  dialogError.value = null;
}
/** Detail dialog blocks changed something: reload and hand it the fresh invoice. */
async function detailChanged(): Promise<void> {
  const uid = dialogInvoice.value?.invoiceUID;
  await afterMutation();
  dialogInvoice.value = invoices.value.find((i) => i.invoiceUID === uid) ?? dialogInvoice.value;
}
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
    'Mindestens eine Rechnung liegt bereits bei dieser Police, ist dort als nicht erstattungsfähig markiert oder schon abgerechnet.',
  );
}

function submitBilling(payload: {
  submissionUID: string;
  billingUID?: string;
  newBilling?: { billingDate: string; billingNumber: string };
  reimbursement: number;
  receiptNumber?: string;
}): void {
  const invoice = dialogInvoice.value;
  if (!invoice) return;
  void runDialog(
    async () => {
      let billingUID = payload.billingUID;
      if (payload.newBilling) {
        const billing = await createBilling({
          submissionUID: payload.submissionUID,
          ...payload.newBilling,
        });
        billingUID = billing.billingUID;
      }
      await createAllocation({
        billingUID: billingUID!,
        invoiceUID: invoice.invoiceUID,
        reimbursement: payload.reimbursement,
        ...(payload.receiptNumber ? { receiptNumber: payload.receiptNumber } : {}),
      });
    },
    () => (billingOpen.value = false),
    `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen (noch offen: ${euro(invoice.remainingAmount)}).`,
  );
}

function confirmClose(): void {
  const invoice = closeTarget.value;
  if (!invoice) return;
  void runDialog(
    () => updateInvoice(invoice.invoiceUID, { reimbursementClosed: true }).then(() => undefined),
    () => (closeTarget.value = null),
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

    <div v-else class="eu-ws__table-wrap">
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
              </div>
            </td>
            <td>{{ germanDate(invoice.invoiceDate) }}</td>
            <td>{{ germanDate(invoice.treatmentDate) }}</td>
            <td>{{ invoice.invoiceNumber }}</td>
            <td>{{ invoice.facilityUID ? facilityNameById.get(invoice.facilityUID) : '–' }}</td>
            <td>
              <div class="eu-ws__amount">
                <span>{{ euro(invoice.invoiceAmount) }}</span>
                <PaymentInfoPopover
                  :invoice="invoice"
                  :facility-name="
                    invoice.facilityUID ? (facilityNameById.get(invoice.facilityUID) ?? null) : null
                  "
                  :agency-name="
                    invoice.agencyUID ? (agencyById.get(invoice.agencyUID)?.name ?? null) : null
                  "
                  :bank-account="
                    invoice.agencyUID
                      ? (agencyById.get(invoice.agencyUID)?.bankAccount ?? null)
                      : null
                  "
                >
                  <template #trigger>
                    <button
                      type="button"
                      class="eu-ws__ampel"
                      :style="{ color: paymentView(invoice).color }"
                      :aria-label="`${paymentView(invoice).label} – Zahlungsinformationen anzeigen`"
                      :title="`${paymentView(invoice).label} – Zahlungsinformationen anzeigen`"
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
                v-else-if="canSubmit(invoice)"
                variant="secondary"
                icon-only
                :icon="faPaperPlane"
                aria-label="Bei weiterer Police einreichen"
                title="Rechnung (bzw. den Rest) bei einer weiteren Police einreichen"
                @click="openSubmit([invoice])"
              />
              <EuButton
                v-if="!invoice.reimbursementClosed && unbilledSubmissions(invoice).length > 0"
                variant="secondary"
                icon-only
                :icon="faHandHoldingDollar"
                aria-label="Abrechnung zuordnen"
                title="Leistungsabrechnung erfassen und Erstattung zuordnen"
                @click="openBilling(invoice)"
              />
              <EuButton
                v-if="
                  invoice.workflowStatus === 'eingereicht' ||
                  invoice.workflowStatus === 'teilabgerechnet'
                "
                variant="secondary"
                icon-only
                :icon="faFileCircleCheck"
                aria-label="Als abgerechnet markieren"
                title="Abrechnung abschließen – der Rest wird nicht weiter eingereicht"
                @click="openClose(invoice)"
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
                v-if="invoice.submissions.some((s) => s.billingCount > 0)"
                variant="secondary"
                icon-only
                :icon="faGavel"
                aria-label="Widerspruch"
                title="Fehlerhafte Leistungsabrechnung als Widerspruch markieren"
                @click="openObjection(invoice)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faPen"
                aria-label="Bearbeiten"
                title="Rechnung bearbeiten"
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
      :contract-analyses="analyses"
    />

    <InvoiceDetailDialog
      :open="detailOpen"
      :invoice="dialogInvoice"
      :account-name="accountName"
      :facilities="facilityOptions"
      :agencies="agencyOptions"
      :agency-iban="agencyIbanMap"
      :contracts="contractOptions"
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
      :count="submitTargets.length"
      :contracts="submitContractOptions"
      :submitting="dialogBusy"
      :error="dialogError"
      @close="submitOpen = false"
      @submit="submitSubmission"
    />
    <BillingDialog
      :open="billingOpen"
      :invoice="dialogInvoice"
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
    <ObjectionDialog
      :open="objectionOpen"
      :invoice="dialogInvoice"
      @close="objectionOpen = false"
      @changed="afterMutation"
    />

    <EuDialog
      :open="closeTarget !== null"
      title="Als abgerechnet markieren"
      @close="closeTarget = null"
    >
      <p v-if="closeTarget">
        Abrechnung von Rechnung {{ closeTarget.invoiceNumber }} abschließen? Der nicht erstattete
        Rest von {{ euro(closeTarget.remainingAmount) }} wird dann bei keiner weiteren Police
        eingereicht. Die Markierung lässt sich in den Rechnungsdetails wieder aufheben.
      </p>
      <p v-if="dialogError" class="eu-ws__error" role="alert">{{ dialogError }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="closeTarget = null">Abbrechen</EuButton>
        <EuButton :disabled="dialogBusy" @click="confirmClose">Als abgerechnet markieren</EuButton>
      </template>
    </EuDialog>

    <EuDialog :open="deleteTargets.length > 0" title="Rechnung löschen" @close="deleteTargets = []">
      <p>{{ deleteTargets.length }} Rechnung(en) wirklich löschen?</p>
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
  padding: 0.55rem 0.7rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-ws__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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
