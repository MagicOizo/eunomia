<script setup lang="ts">
import { isHttpUrl } from '@eunomia/shared';
import {
  faChevronLeft,
  faFileInvoiceDollar,
  faPaperPlane,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

import type { AgencyPaymentDetailDto } from '../agencies/api';
import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { apiData } from '../lib/api';
import { useDialogAction } from '../lib/dialog-action';
import { NO_PERMISSION } from '../lib/error-messages';
import { germanDate, plural } from '../lib/format';
import { describeError } from '../lib/errors';
import { listResource } from '../lib/resource';
import { useAuthStore } from '../stores/auth';
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
import {
  type ContractOption,
  type ContractPeriod,
  commonPolicies,
  commonSubmittableContracts,
  submittableContracts,
} from './eligibility';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';
import { useInvoiceDialogs } from './invoice-dialogs';
import { notCoveredTitle } from './not-covered';
import InvoiceBriefList from './InvoiceBriefList.vue';
import InvoiceFormDialog from './InvoiceFormDialog.vue';
import InvoiceSummary from './InvoiceSummary.vue';
import InvoiceTable, { type InvoiceRowView } from './InvoiceTable.vue';
import { type InvoiceBadgeView, invoiceBadge } from './recommendation';
import { reimbursementGap } from './reimbursement-gap';
import SettleDialog from './SettleDialog.vue';
import SubmitDialog from './SubmitDialog.vue';
import { treatmentDaysLabel } from './treatment-days';
import { PAYMENT_COLOR_VAR, PAYMENT_DISPLAY, paymentState } from './payment';

const props = withDefaults(
  defineProps<{
    accountUID: string;
    /** Treatment year to open on — set by the invoice-number search (issues.md 6). */
    focusYear?: string;
    /** Invoice to mark and scroll to once its year is loaded. */
    focusInvoiceUID?: string;
  }>(),
  { focusYear: undefined, focusInvoiceUID: undefined },
);

interface ContractRef extends ContractPeriod {
  contractUID: string;
  contractNumber: string;
  companyName: string;
}

/** "Nummer · Versicherung" — tells a person's full and supplementary policy apart. */
const contractLabel = (c: ContractRef): string => `${c.contractNumber} · ${c.companyName}`;

const auth = useAuthStore();

/**
 * Whether this person's invoices may be written — every action of this page
 * needs MANAGE_INVOICES for exactly this account (CR-26). Viewing got the user
 * here: the route lets them in on VIEW_INVOICES alone.
 */
const mayManage = computed(() => auth.can('MANAGE_INVOICES', props.accountUID));
/** Why the actions are disabled, or nothing when they are not. */
const noPermission = computed(() => (mayManage.value ? undefined : NO_PERMISSION));

const accountName = ref('');
const years = ref<number[]>([]);
const activeYear = ref(new Date().getFullYear());
const invoices = ref<InvoiceDto[]>([]);
const contracts = ref<ContractRef[]>([]);
const facilityOptions = ref<SelectOption[]>([]);
const facilityNameById = ref<Map<string, string>>(new Map());
const agencyOptions = ref<SelectOption[]>([]);
const agencyById = ref<Map<string, { name: string; accounts: AgencyPaymentDetailDto[] }>>(
  new Map(),
);
/** agencyUID → its payment details, for the masks' pickers and the GiroCode. */
const paymentDetailMap = computed(() =>
  Object.fromEntries([...agencyById.value].map(([uid, a]) => [uid, a.accounts])),
);
/** The agency's name and payment details for one invoice, or empty when none. */
const agencyOf = (invoice: InvoiceDto) =>
  (invoice.agencyUID ? agencyById.value.get(invoice.agencyUID) : undefined) ?? {
    name: null,
    accounts: [],
  };
/** facilityUID → name, for the invoice lists of the dialogs. */
const facilityNameMap = computed(() => Object.fromEntries(facilityNameById.value));
/** The facility's name for one invoice, or null when it has none. */
const facilityName = (invoice: InvoiceDto): string | null =>
  invoice.facilityUID ? (facilityNameById.value.get(invoice.facilityUID) ?? null) : null;

/**
 * All treatment days, for the column's tooltip. The span in the cell says when
 * the treatment began and ended, not which days in between were billed — so
 * wherever it is shown, the full list belongs within reach.
 */
const treatmentTitle = (invoice: InvoiceDto): string | undefined =>
  invoice.treatmentDates.length < 2 ? undefined : invoice.treatmentDates.map(germanDate).join(', ');
const plan = ref<ReimbursementPlanDto | null>(null);
/** The optimizer's advice per invoice; invoices with nothing to do have no entry. */
const recommendationBadges = computed(() => {
  const policies = new Map((plan.value?.policies ?? []).map((p) => [p.contractUID, p]));
  const badges = new Map<string, InvoiceBadgeView>();
  // A not-covered invoice carries its own mark in the row; the optimizer's
  // "Nicht erstattbar" beside it would say the same thing twice (Slice 42).
  const notCovered = new Set(
    invoices.value.filter((invoice) => invoice.notCovered).map((invoice) => invoice.invoiceUID),
  );
  for (const invoicePlan of plan.value?.invoices ?? []) {
    if (notCovered.has(invoicePlan.invoiceUID)) continue;
    const badge = invoiceBadge(invoicePlan, policies);
    if (badge) badges.set(invoicePlan.invoiceUID, badge);
  }
  return badges;
});
const selected = ref<Set<string>>(new Set());
/**
 * The invoice a search led here (props.focusInvoiceUID), while it is still
 * worth pointing at. It answers one search — the year tabs and every change to
 * the list drop it again.
 */
const foundUID = ref<string | null>(null);
const table = useTemplateRef<InstanceType<typeof InvoiceTable>>('table');

const loading = ref(false);
const loadError = ref<string | null>(null);

/** Every write of this page: busy, error, and the reload that follows it. */
const action = useDialogAction(afterMutation);
const dialogs = useInvoiceDialogs(action);

// The policy's term travels with the option: the submit dialog offers the
// policies that ran over the treatment period first (see eligibility.ts).
const contractOptions = computed<ContractOption[]>(() =>
  contracts.value.map((c) => ({
    value: c.contractUID,
    label: contractLabel(c),
    contractBegin: c.contractBegin,
    contractEnd: c.contractEnd,
  })),
);
/** Policies all invoices of the submit dialog can still go to. */
const submitContractOptions = computed(() =>
  commonSubmittableContracts(dialogs.submitTargets, contractOptions.value),
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
 * A Leistungsabrechnung belongs to a policy and may answer invoices handed in on
 * different days, so booking several at once needs a policy they were all
 * submitted to — not one shared submission (Slice 37).
 */
const selectedBookable = computed(() =>
  commonPolicies(selectedInvoices.value).length > 0 ? selectedInvoices.value : [],
);
/**
 * The rows as the table shows them: everything looked up here, where the
 * facilities, the agencies and the optimizer's plan are (see InvoiceTable).
 */
const rows = computed<InvoiceRowView[]>(() =>
  invoices.value.map((invoice) => {
    const agency = agencyOf(invoice);
    return {
      invoice,
      facilityName: facilityName(invoice),
      agencyName: agency.name,
      paymentDetails: agency.accounts,
      badge: recommendationBadges.value.get(invoice.invoiceUID) ?? null,
      payment: paymentView(invoice),
      gap: reimbursementGap(invoice),
      treatmentTitle: treatmentTitle(invoice),
      treatmentLabel: treatmentDaysLabel(invoice.treatmentDates),
      notCoveredTitle: notCoveredTitle(invoice),
      canSubmit: canSubmit(invoice),
      hasDocument: isHttpUrl(invoice.documentLink),
    };
  }),
);

/** Loads the account-level data that does not depend on the selected year. */
async function loadStatic(): Promise<void> {
  const account = await apiData<{ firstname: string; surname: string | null }>(
    `/accounts/${props.accountUID}`,
  );
  accountName.value = [account.firstname, account.surname].filter(Boolean).join(' ');

  // The API filters by insured person, so nothing of the other households is
  // transferred here at all (CR-27).
  const accountContracts = await listResource<ContractRef>(
    `/contracts?accountUID=${props.accountUID}`,
  );
  contracts.value = accountContracts.map((c) => ({
    contractUID: c.contractUID,
    contractNumber: c.contractNumber,
    companyName: c.companyName,
    contractBegin: c.contractBegin,
    contractEnd: c.contractEnd,
  }));

  await loadLookups();
}

/**
 * The two lists the invoice dialogs pick from. Separate from the rest of
 * loadStatic() because a dialog can create a facility or an agency on the side
 * — without this reload the new entry would stay unknown to the table, the
 * mask and the IBAN map until the page is reloaded.
 */
async function loadLookups(): Promise<void> {
  const facilities = await listResource<{ facilityUID: string; facilityName: string }>(
    '/facilities',
  );
  facilityOptions.value = facilities.map((f) => ({ value: f.facilityUID, label: f.facilityName }));
  facilityNameById.value = new Map(facilities.map((f) => [f.facilityUID, f.facilityName]));

  // Every set per agency, not just the first: an agency holds several and each
  // invoice names the one it goes to (see agencies/payment-details.ts).
  const agencies = await listResource<{
    agencyUID: string;
    agencyName: string;
    accounts: AgencyPaymentDetailDto[];
  }>('/agencies');
  agencyOptions.value = agencies.map((a) => ({ value: a.agencyUID, label: a.agencyName }));
  agencyById.value = new Map(
    agencies.map((a) => [a.agencyUID, { name: a.agencyName, accounts: a.accounts }]),
  );
}

/** Payment-status traffic light for a row: icon, colour and label in one bundle. */
function paymentView(invoice: InvoiceDto) {
  const state = paymentState(invoice);
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

/**
 * Marks the invoice a search led here and asks the table to bring it into view
 * — which it knows how to do, down to its own scroll container.
 */
async function markFound(): Promise<void> {
  const wanted = props.focusInvoiceUID;
  if (wanted === undefined || !invoices.value.some((i) => i.invoiceUID === wanted)) {
    foundUID.value = null;
    return;
  }
  foundUID.value = wanted;
  await nextTick();
  await table.value?.revealFound();
}

async function init(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await loadStatic();
    await refreshYears();
    // The search hands the treatment year along; without it the current year
    // (or the newest one with invoices) stays selected.
    const wantedYear = Number(props.focusYear);
    if (Number.isInteger(wantedYear) && years.value.includes(wantedYear)) {
      activeYear.value = wantedYear;
    }
    await loadYearData();
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
  // Only now does the table exist — while `loading` was true the view showed
  // its placeholder, and there was no row to mark.
  await markFound();
}

async function afterMutation(): Promise<void> {
  foundUID.value = null;
  await refreshYears();
  await loadYearData();
}

watch(() => props.accountUID, init, { immediate: true });

async function selectYear(year: number): Promise<void> {
  activeYear.value = year;
  foundUID.value = null;
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
  const all = invoices.value.length > 0 && selected.value.size === invoices.value.length;
  selected.value = all ? new Set() : new Set(invoices.value.map((i) => i.invoiceUID));
}

function submitDetail(payload: Record<string, unknown>): void {
  const invoice = dialogs.invoice;
  if (!invoice) return;
  // No blanket conflict sentence here: the invoice PATCH answers 409 with
  // several codes — the amount below what was reimbursed, "only a submitted
  // invoice can be marked as billed", and since Slice 42 "an invoice already
  // submitted cannot be marked as not covered". Each of them is translated by
  // its code in lib/error-messages.ts, and a hint would shadow all but one.
  void action.run(
    () => updateInvoice(invoice.invoiceUID, payload),
    () => (dialogs.detailOpen = false),
  );
}

/** The optimizer's advice for the invoice the detail dialog shows. */
const detailPlan = computed(
  () => plan.value?.invoices.find((i) => i.invoiceUID === dialogs.invoice?.invoiceUID) ?? null,
);

/** Detail dialog blocks changed something: reload and hand it the fresh invoice. */
async function detailChanged(): Promise<void> {
  const uid = dialogs.invoice?.invoiceUID;
  await afterMutation();
  dialogs.invoice = invoices.value.find((i) => i.invoiceUID === uid) ?? dialogs.invoice;
}

/** The invoices behind the pending delete, for the confirmation's list. */
const deleteInvoices = computed(() =>
  invoices.value.filter((i) => dialogs.deleteTargets.includes(i.invoiceUID)),
);

function submitInvoiceForm(payload: Record<string, unknown>): void {
  const edited = dialogs.editing;
  void action.run(
    () => (edited ? updateInvoice(edited.invoiceUID, payload) : createInvoice(payload)),
    () => (dialogs.formOpen = false),
  );
}

function submitSubmission(payload: { contractUID: string; submittedDate: string }): void {
  const invoiceUIDs = dialogs.submitTargets.map((i) => i.invoiceUID);
  void action.run(
    () => createSubmission({ ...payload, invoiceUIDs }),
    () => (dialogs.submitOpen = false),
  );
}

function submitBilling(payload: BillingAllocationPayload): void {
  void action.run(
    () => saveBillingAllocations(payload),
    () => (dialogs.billingOpen = false),
  );
}

function submitSettle(transferDate: string): void {
  const invoice = dialogs.invoice;
  if (!invoice) return;
  void action.run(
    () => updateInvoice(invoice.invoiceUID, { transferDate }),
    () => (dialogs.settleOpen = false),
  );
}

/**
 * The schemas refuse anything but http(s) and migration 017 cleared what was
 * stored before that, so this is the second line, not the first: the sink does
 * not take the row's word for it (SEC-01).
 */
function openDocument(invoice: InvoiceDto): void {
  const link = invoice.documentLink;
  if (isHttpUrl(link)) window.open(link, '_blank', 'noopener');
}

function confirmDelete(): void {
  const uids = dialogs.deleteTargets;
  if (uids.length === 0) return;
  void action.run(
    () => Promise.all(uids.map((uid) => deleteInvoice(uid))),
    () => (dialogs.deleteTargets = []),
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
      <EuButton
        :icon="faPlus"
        :disabled="!mayManage"
        :title="noPermission"
        @click="dialogs.openCreate"
        >Neue Rechnung</EuButton
      >
      <EuButton
        :icon="faPaperPlane"
        variant="secondary"
        :disabled="!mayManage || selectedSubmittable.length === 0"
        :title="noPermission"
        @click="dialogs.openSubmit(selectedSubmittable)"
      >
        Einreichen ({{ selectedSubmittable.length }})
      </EuButton>
      <EuButton
        :icon="faFileInvoiceDollar"
        variant="secondary"
        :disabled="!mayManage || selectedBookable.length === 0"
        :title="noPermission"
        @click="dialogs.openBilling(selectedBookable)"
      >
        Abrechnung zuordnen ({{ selectedBookable.length }})
      </EuButton>
      <EuButton
        :icon="faTrash"
        variant="secondary"
        :disabled="!mayManage || selected.size === 0"
        :title="noPermission"
        @click="dialogs.openDelete(Array.from(selected))"
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

    <InvoiceTable
      v-else
      ref="table"
      :rows="rows"
      :selected="selected"
      :found-u-i-d="foundUID"
      :can-manage="mayManage"
      @toggle="toggleSelect"
      @toggle-all="toggleSelectAll"
      @detail="dialogs.openDetail"
      @submit="dialogs.openSubmit"
      @settle="dialogs.openSettle"
      @remove="dialogs.openDelete"
      @document="openDocument"
    />

    <InvoiceSummary
      v-if="!loading && !loadError && invoices.length > 0"
      :invoices="invoices"
      :plan="plan"
    />

    <InvoiceDetailDialog
      :open="dialogs.detailOpen"
      :invoice="dialogs.invoice"
      :account-name="accountName"
      :facilities="facilityOptions"
      :agencies="agencyOptions"
      :agency-payment-details="paymentDetailMap"
      :contracts="contractOptions"
      :plan-invoice="detailPlan"
      :submitting="action.busy"
      :error="action.error"
      @close="dialogs.detailOpen = false"
      @submit="submitDetail"
      @changed="detailChanged"
      @entity-created="loadLookups"
    />
    <InvoiceFormDialog
      :open="dialogs.formOpen"
      :editing="dialogs.editing"
      :account-u-i-d="accountUID"
      :facilities="facilityOptions"
      :agencies="agencyOptions"
      :agency-payment-details="paymentDetailMap"
      :submitting="action.busy"
      :error="action.error"
      @close="dialogs.formOpen = false"
      @submit="submitInvoiceForm"
      @entity-created="loadLookups"
    />
    <SubmitDialog
      :open="dialogs.submitOpen"
      :invoices="dialogs.submitTargets"
      :facility-names="facilityNameMap"
      :contracts="submitContractOptions"
      :submitting="action.busy"
      :error="action.error"
      @close="dialogs.submitOpen = false"
      @submit="submitSubmission"
    />
    <BillingDialog
      :open="dialogs.billingOpen"
      :invoices="dialogs.billingTargets"
      :facility-names="facilityNameMap"
      :submitting="action.busy"
      :error="action.error"
      @close="dialogs.billingOpen = false"
      @submit="submitBilling"
    />
    <SettleDialog
      :open="dialogs.settleOpen"
      :invoice="dialogs.invoice"
      :submitting="action.busy"
      :error="action.error"
      @close="dialogs.settleOpen = false"
      @submit="submitSettle"
    />
    <EuDialog
      :open="dialogs.deleteTargets.length > 0"
      title="Rechnung löschen"
      @close="dialogs.deleteTargets = []"
    >
      <p>{{ plural(dialogs.deleteTargets.length, 'Rechnung', 'Rechnungen') }} wirklich löschen?</p>
      <InvoiceBriefList :invoices="deleteInvoices" :facility-names="facilityNameMap" />
      <p v-if="action.error" class="eu-ws__error" role="alert">{{ action.error }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="dialogs.deleteTargets = []">Abbrechen</EuButton>
        <EuButton :disabled="action.busy" @click="confirmDelete">Löschen</EuButton>
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
</style>
