<script setup lang="ts">
import { faBan, faPaperPlane, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, nextTick, reactive, ref, toRef, watch } from 'vue';

import PaymentDetailFormDialog from '../agencies/PaymentDetailFormDialog.vue';
import { invoicePaymentDetail } from '../agencies/payment-details';
import type { AgencyPaymentDetailDto } from '../agencies/api';
import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailDays from '../design-system/components/EuDetailDays.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDetailMask from '../design-system/components/EuDetailMask.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import type { PickerOption } from '../design-system/components/EuEntityPicker.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import ResourceFormDialog from '../components/resource/ResourceFormDialog.vue';
import { describeError } from '../lib/errors';
import { NO_PERMISSION } from '../lib/error-messages';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { useAuthStore } from '../stores/auth';
import { germanMoney } from '../lib/format';
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
  updateAllocation,
  withdrawSubmission,
} from './api';
import { type BillingAllocationPayload, saveBillingAllocations } from './billing-actions';
import AllocationDialog from './AllocationDialog.vue';
import BillingDialog from './BillingDialog.vue';
import { usePaymentDetailPicker } from './payment-detail-picker';
import { CREATE_KINDS, useEntityCreate } from './entity-create';
import { type ContractOption, policyLabel, submittableContracts } from './eligibility';
import { reasonRequiredMessage } from './not-covered';
import {
  differentYearsMessage,
  furtherDays,
  normalizeDays,
  sameCalendarYear,
  treatmentDaysLabel,
} from './treatment-days';
import ExclusionDialog from './ExclusionDialog.vue';
import ObjectionDialog from './ObjectionDialog.vue';
import PaymentQrPopover from './PaymentQrPopover.vue';
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
const props = defineProps<
  FormDialogProps & {
    invoice: InvoiceDto | null;
    accountName: string;
    facilities: SelectOption[];
    agencies: SelectOption[];
    /** agencyUID → its payment details, to pick the ones the invoice goes to. */
    agencyPaymentDetails: Record<string, AgencyPaymentDetailDto[]>;
    /** All policies of the insured person, for the submit and exclusion pickers. */
    contracts: ContractOption[];
    /** The optimizer's advice for this invoice, shown per policy card. */
    planInvoice: PlanInvoiceDto | null;
  }
>();

const emit = defineEmits<{
  close: [];
  submit: [payload: Record<string, unknown>];
  /** A submission or exclusion changed: the parent reloads and passes the fresh invoice. */
  changed: [];
  /** An entity was created on the side: the parent's lookup lists are stale. */
  entityCreated: [];
}>();

const auth = useAuthStore();

/**
 * Whether this invoice may be written — MANAGE_INVOICES for the insured person
 * it belongs to (CR-26). Reading it is enough to open this dialog: the mask
 * then shows the invoice as text and the assignment block offers nothing.
 */
const mayManage = computed(() => auth.can('MANAGE_INVOICES', props.invoice?.accountUID));
/** Why the actions are disabled, or nothing when they are not. */
const noPermission = computed(() => (mayManage.value ? undefined : NO_PERMISSION));

const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
// The treatment days besides the leading one (Slice 41). They live beside
// `values` rather than in it: a mask value is a single scalar, and widening
// that type would reach into the policy and agency masks as well.
const extraDays = ref<string[]>([]);
const savedExtraDays = ref<string[]>([]);

// Local option copies so an ad-hoc-created entity can be appended and selected
// immediately, without waiting for the parent to reload its lists.
const localFacilities = ref<PickerOption[]>([]);
const localAgencies = ref<PickerOption[]>([]);
watch(
  () => props.facilities,
  (list) => (localFacilities.value = list.map((o) => ({ value: o.value, label: o.label }))),
  { immediate: true },
);
watch(
  () => props.agencies,
  (list) => (localAgencies.value = list.map((o) => ({ value: o.value, label: o.label }))),
  { immediate: true },
);

// Ad-hoc create from the two pickers of the mask — same sub-dialog as the
// create form uses. The picked value is only written to the invoice on Save.
const {
  open: createOpen,
  kind: createKind,
  prefill: createPrefill,
  busy: createBusy,
  error: createError,
  start: openCreate,
  submit: onCreateSubmit,
} = useEntityCreate((kind, option, row) => {
  if (kind === 'facility') {
    localFacilities.value = [...localFacilities.value, option];
    values.facilityUID = option.value;
  } else {
    localAgencies.value = [...localAgencies.value, option];
    // A new agency is created with its first details; those are the pick.
    paymentDetailPicker.remember(option.value, (row.accounts ?? []) as AgencyPaymentDetailDto[]);
    values.agencyUID = option.value;
  }
  emit('entityCreated');
});

// The payment details of the picked agency (Slice 44), with their ad-hoc create.
const paymentDetailPicker = usePaymentDetailPicker(toRef(props, 'agencyPaymentDetails'));
watch(
  () => props.agencyPaymentDetails,
  (map) => paymentDetailPicker.refresh(map),
);
const paymentDetailOptions = computed(() =>
  typeof values.agencyUID === 'string' ? paymentDetailPicker.optionsOf(values.agencyUID) : [],
);

/** What was added from the picker is selected right away. */
async function onPaymentDetailCreate(
  payload: Parameters<typeof paymentDetailPicker.submit>[0],
): Promise<void> {
  const uid = await paymentDetailPicker.submit(payload);
  if (uid !== null) values.agencyAccountUID = uid;
}

/**
 * True while the mask is being filled from an opened invoice. Seeding writes
 * the same fields a user can change, and the rules below must not read that as
 * a change — an invoice would otherwise look edited the moment it is opened.
 */
const seeding = ref(false);

// Seeded per opened invoice only: a reload after a block action passes a
// fresh invoice object and must not discard unsaved edits in the mask — hence
// the invoice's UID as the second trigger, not the invoice itself.
const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const inv = props.invoice;
    if (!inv) return;
    const seed: Record<string, DetailValue> = {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      treatmentDate: inv.treatmentDate,
      facilityUID: inv.facilityUID,
      invoiceAmount: inv.invoiceAmount,
      directPayment: inv.directPayment,
      transferUntilDate: inv.transferUntilDate,
      transferDate: inv.transferDate,
      transferSubject: inv.transferSubject,
      agencyUID: inv.agencyUID,
      agencyAccountUID: inv.agencyAccountUID,
      documentLink: inv.documentLink,
      reimbursementClosed: inv.reimbursementClosed,
      notCovered: inv.notCovered,
      notCoveredReason: inv.notCoveredReason,
    };
    seeding.value = true;
    Object.assign(values, seed);
    Object.assign(saved, seed);
    // Cleared once the watchers this seeding triggered have run.
    void nextTick(() => (seeding.value = false));
    extraDays.value = furtherDays(inv);
    savedExtraDays.value = [...extraDays.value];
  },
  () => props.invoice?.invoiceUID,
);

/**
 * Direct payment, spelled out in the mask (Slice 43). The bill was settled on
 * the spot, so it is due and paid on its own date and there is nothing left to
 * transfer: the two dates follow the invoice date — correcting it here shows
 * at once what will be saved — and the transfer fields are emptied. Switching
 * the flag off frees all four again, empty. The API keeps the same rule for
 * every write; this is only what the mask shows while it is open.
 */
watch(
  () => [values.directPayment, values.invoiceDate] as const,
  ([now], [before]) => {
    if (seeding.value) return;
    if (now === true) {
      values.transferUntilDate = values.invoiceDate;
      values.transferDate = values.invoiceDate;
      if (values.agencyUID) values.agencyUID = null;
      if (values.agencyAccountUID) values.agencyAccountUID = null;
      if (values.transferSubject) values.transferSubject = '';
      return;
    }
    // Only the switch going off clears them; a corrected invoice date on an
    // ordinary invoice leaves the dates the user entered alone.
    if (before === true) {
      values.transferUntilDate = null;
      values.transferDate = null;
    }
  },
);

/**
 * Moving the invoice to another agency takes its payment details along: the old
 * one belongs to the old agency, and the new agency's first is the suggestion.
 * The API applies the same rule to every write (`nextPaymentDetail`); this is
 * what the mask shows meanwhile.
 */
watch(
  () => values.agencyUID,
  (now) => {
    if (seeding.value) return;
    values.agencyAccountUID =
      typeof now === 'string' && now !== '' ? paymentDetailPicker.suggestionFor(now) || null : null;
  },
);

// Dropping the "nicht gedeckt" mark drops its reason, the way the API stores it
// (Slice 42): a reason without the mark is a dead entry.
watch(
  () => values.notCovered,
  (now) => {
    if (now === true) return;
    if (values.notCoveredReason) values.notCoveredReason = '';
  },
);

/**
 * The span the edited days cover, shown under the list once there is more than
 * one day. It follows the mask, not the saved invoice, so adding a day says
 * right away what the invoice will then cover.
 */
const treatmentSpan = computed(() => {
  const days = normalizeDays([
    typeof values.treatmentDate === 'string' ? values.treatmentDate : '',
    ...extraDays.value,
  ]);
  return days.length > 1 ? `Zeitraum ${treatmentDaysLabel(days)}` : null;
});

const statusDisplay = computed(() =>
  props.invoice ? STATUS_DISPLAY[props.invoice.workflowStatus] : null,
);
const directPayment = computed(() => values.directPayment === true);
const notCovered = computed(() => values.notCovered === true);
/**
 * The details the mask names, not the saved ones: picking others says at once
 * where the money will go. Falls back to the agency's first, for an invoice
 * that names none.
 */
const paymentDetailForSelected = computed(() => {
  const uid = values.agencyUID;
  if (typeof uid !== 'string' || uid === '') return null;
  const picked = typeof values.agencyAccountUID === 'string' ? values.agencyAccountUID : null;
  return invoicePaymentDetail(paymentDetailPicker.paymentDetailsOf(uid), picked);
});
const ibanForSelected = computed(() => paymentDetailForSelected.value?.bankAccount ?? '');
const agencyNameForSelected = computed(() => {
  const uid = values.agencyUID;
  const agency = localAgencies.value.find((option) => option.value === uid)?.label ?? '';
  // Where the details name a beneficiary of their own, the transfer is addressed
  // to that name — that is what belongs in the GiroCode.
  return paymentDetailForSelected.value?.recipientName ?? agency;
});
// The GiroCode follows the mask, not the saved invoice: it sits next to the
// IBAN row, which already shows the agency currently picked, and what you scan
// should be what you see. Gone once there is nothing left to transfer — the
// payment traffic light's rule, spelled out against the edited values.
const showQr = computed(
  () => !directPayment.value && ibanForSelected.value !== '' && !values.transferDate,
);
const amountForQr = computed(() =>
  typeof values.invoiceAmount === 'number' ? values.invoiceAmount : 0,
);
const subjectForQr = computed(() =>
  typeof values.transferSubject === 'string' && values.transferSubject !== ''
    ? values.transferSubject
    : null,
);
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
const editingAllocation = ref<InvoiceAllocationDto | null>(null);
const allocationError = ref<string | null>(null);

watch(
  () => [props.open, props.invoice?.invoiceUID] as const,
  () => (blockError.value = null),
);

/** facilityUID → name, for the invoice lists of the sub-dialogs. */
const facilityNames = computed(() =>
  Object.fromEntries(localFacilities.value.map((f) => [f.value, f.label])),
);

/**
 * Policies that can still be marked: not submitted there and not marked yet.
 * An invoice that is not covered at all needs none of them — the mark at the
 * single policy would say less than the one it already carries (Slice 42).
 */
const markableContracts = computed(() => {
  const inv = props.invoice;
  if (!inv || inv.notCovered) return [];
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
    () => saveBillingAllocations(payload),
    (m) => (billingError.value = m),
    `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen (noch offen: ${germanMoney(inv.remainingAmount)}).`,
  );
  if (ok) billingOpen.value = false;
}

function openAllocation(allocation: InvoiceAllocationDto): void {
  allocationError.value = null;
  editingAllocation.value = allocation;
}

async function saveAllocation(payload: {
  allocationUID: string;
  reimbursement: number;
  receiptNumber: string | null;
}): Promise<void> {
  const inv = props.invoice;
  if (!inv) return;
  allocationError.value = null;
  const ok = await runBlock(
    () =>
      updateAllocation(payload.allocationUID, {
        reimbursement: payload.reimbursement,
        receiptNumber: payload.receiptNumber,
      }),
    (m) => (allocationError.value = m),
    `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen (Rechnungsbetrag: ${germanMoney(inv.invoiceAmount)}).`,
  );
  if (ok) editingAllocation.value = null;
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
  clear();
  if (!props.invoice) return;
  if (
    !str(values.invoiceNumber) ||
    !values.invoiceDate ||
    !values.treatmentDate ||
    values.invoiceAmount === null
  ) {
    return fail('Bitte Rechnungsnummer, Rechnungsdatum, Behandlungsdatum und Betrag ausfüllen.');
  }
  // The complete list, leading day included: the API takes its earliest entry
  // as `treatmentDate` (Slice 41).
  const days = normalizeDays([String(values.treatmentDate), ...extraDays.value]);
  if (!sameCalendarYear(days)) return fail(differentYearsMessage());
  const reason = str(values.notCoveredReason);
  if (notCovered.value && reason === '') return fail(reasonRequiredMessage());
  const dp = directPayment.value;
  emit('submit', {
    invoiceNumber: str(values.invoiceNumber),
    invoiceDate: values.invoiceDate,
    treatmentDate: values.treatmentDate,
    treatmentDates: days,
    invoiceAmount: values.invoiceAmount,
    directPayment: dp,
    notCovered: notCovered.value,
    notCoveredReason: notCovered.value ? reason : null,
    facilityUID: values.facilityUID || null,
    documentLink: str(values.documentLink) || null,
    transferUntilDate: values.transferUntilDate || null,
    transferDate: values.transferDate || null,
    // Only the direct-payment-gated fields are cleared when paid directly.
    transferSubject: dp ? null : str(values.transferSubject) || null,
    agencyUID: dp ? null : values.agencyUID || null,
    agencyAccountUID: dp ? null : values.agencyAccountUID || null,
    // The "billed" mark only exists for submitted invoices (the API rejects it otherwise).
    ...(isSubmitted.value ? { reimbursementClosed: values.reimbursementClosed === true } : {}),
  });
}
</script>

<template>
  <EuDialog :open="open" title="Rechnungsdetails" wide @close="emit('close')">
    <EuDetailMask v-if="invoice" :readonly="!mayManage">
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
      <!-- One bill of a practice often covers several appointments (Slice 41).
           The field above is the leading day; the rest are this list. -->
      <EuDetailDays
        v-model="extraDays"
        :saved-value="savedExtraDays"
        label="Weitere Behandlungstage"
        add-label="Behandlungstag hinzufügen"
        :hint="treatmentSpan"
      />
      <EuDetailField
        v-model="values.facilityUID"
        :saved-value="saved.facilityUID"
        label="Leistungserbringer"
        type="select"
        :options="localFacilities"
        allow-create
        create-noun="Leistungserbringer"
        @create="openCreate('facility', $event)"
      />
      <EuDetailField label="Versicherter" type="readonly" :model-value="accountName" />

      <EuDetailField
        v-model="values.transferUntilDate"
        :saved-value="saved.transferUntilDate"
        label="Zahlungsziel"
        type="date"
        :disabled="directPayment"
      />
      <EuDetailField
        v-model="values.transferDate"
        :saved-value="saved.transferDate"
        label="Zahlungsdatum"
        type="date"
        :disabled="directPayment"
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
        :options="localAgencies"
        :disabled="directPayment"
        allow-create
        create-noun="Abrechnungsdienstleister"
        @create="openCreate('agency', $event)"
      />
      <!-- An agency holds several sets at once, and the invoice names the
           one it goes to (Slice 44). The GiroCode hangs off this row, because
           what you scan is what this row says. -->
      <EuDetailField
        v-model="values.agencyAccountUID"
        :saved-value="saved.agencyAccountUID"
        label="Kontoverbindung"
        type="select"
        :options="paymentDetailOptions"
        :disabled="directPayment || !values.agencyUID"
        allow-create
        create-noun="Kontoverbindung"
        @create="paymentDetailPicker.start(String(values.agencyUID ?? ''))"
      >
        <template #after>
          <!-- Always rendered, only hidden: the wide dialog measures itself
               against its content, so a button that disappears takes the
               dialog's width with it while a payment date is being typed
               (issues.md 0.13.0-5). `visibility: hidden` keeps the space and
               takes the button out of the tab order and the a11y tree alike. -->
          <span class="eu-detail__qr" :class="{ 'is-hidden': !showQr }">
            <PaymentQrPopover
              :recipient="agencyNameForSelected"
              :iban="ibanForSelected"
              :bic="paymentDetailForSelected?.bic"
              :amount="amountForQr"
              :subject="subjectForQr"
            />
          </span>
        </template>
      </EuDetailField>
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

      <!-- Not covered by the insurance at all (Slice 42): the invoice goes to no
           policy and fills no deductible; the reason goes with the mark. -->
      <EuDetailField
        v-model="values.notCovered"
        :saved-value="saved.notCovered"
        label="Nicht gedeckt"
        type="toggle"
      />
      <EuDetailField
        v-model="values.notCoveredReason"
        :saved-value="saved.notCoveredReason"
        label="Begründung"
        type="text"
        :disabled="!notCovered"
      />

      <!-- Zuordnungsblock (Karten je Leistungsabrechnung): Slice 21. -->

      <EuDetailField
        label="Erstattung"
        type="readonly"
        :model-value="germanMoney(invoice.reimbursedTotal)"
      />
      <template v-if="isSubmitted">
        <EuDetailField
          label="Noch nicht erstattet"
          type="readonly"
          :model-value="germanMoney(invoice.remainingAmount)"
        />
        <EuDetailField
          v-model="values.reimbursementClosed"
          :saved-value="saved.reimbursementClosed"
          label="Als abgerechnet markiert"
          type="toggle"
        />
      </template>
    </EuDetailMask>

    <p v-if="shownError" class="eu-detail__error" role="alert">{{ shownError }}</p>

    <template v-if="invoice">
      <section class="eu-detail-block" aria-labelledby="eu-invoice-assignment">
        <div class="eu-detail-block__head">
          <h3 id="eu-invoice-assignment">Zuordnung</h3>
          <div class="eu-detail-block__head-actions">
            <EuButton
              variant="secondary"
              :icon="faPaperPlane"
              :disabled="!mayManage || openContracts.length === 0 || blockBusy"
              :title="noPermission"
              @click="
                submitError = null;
                submitOpen = true;
              "
              >Einreichen</EuButton
            >
            <EuButton
              variant="secondary"
              :icon="faBan"
              :disabled="!mayManage || markableContracts.length === 0 || blockBusy"
              :title="noPermission"
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
            :can-manage="mayManage"
            @bill="openBilling"
            @objection="objectionOpen = true"
            @withdraw="pendingWithdraw = $event"
            @edit-allocation="openAllocation"
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
              :title="
                mayManage ? `Markierung für ${exclusion.contractNumber} entfernen` : NO_PERMISSION
              "
              :disabled="!mayManage || blockBusy"
              @click="pendingRemove = exclusion"
            />
          </article>
        </div>
      </section>
      <p v-if="blockError" class="eu-detail__error" role="alert">{{ blockError }}</p>
    </template>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton v-if="mayManage" :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>

  <!-- Adding payment details to the picked agency, from its picker in the mask. -->
  <PaymentDetailFormDialog
    :open="paymentDetailPicker.dialogOpen.value"
    :entry="null"
    :submitting="paymentDetailPicker.busy.value"
    :error="paymentDetailPicker.error.value"
    @close="paymentDetailPicker.dialogOpen.value = false"
    @submit="onPaymentDetailCreate"
  />

  <!-- Ad-hoc create for the entity picked in the mask, prefilled with the typed name. -->
  <ResourceFormDialog
    :open="createOpen"
    :title="`${CREATE_KINDS[createKind].config.singular} anlegen`"
    :fields="CREATE_KINDS[createKind].config.fields"
    :options="{}"
    :prefill="createPrefill"
    :submitting="createBusy"
    :error="createError"
    @close="createOpen = false"
    @submit="onCreateSubmit"
  />
  <SubmitDialog
    :open="submitOpen"
    :invoices="invoice ? [invoice] : []"
    :facility-names="facilityNames"
    :contracts="openContracts"
    :submitting="blockBusy"
    :error="submitError"
    @close="submitOpen = false"
    @submit="saveSubmission"
  />
  <BillingDialog
    :open="billingOpen"
    :invoices="invoice ? [invoice] : []"
    :facility-names="facilityNames"
    :preset-contract="billingSubmission?.contractUID ?? null"
    :submitting="blockBusy"
    :error="billingError"
    @close="billingOpen = false"
    @submit="saveBilling"
  />
  <AllocationDialog
    :open="editingAllocation !== null"
    :allocation="editingAllocation"
    :invoice="invoice"
    :submitting="blockBusy"
    :error="allocationError"
    @close="editingAllocation = null"
    @submit="saveAllocation"
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
      Die Erstattung von {{ germanMoney(pendingAllocation.reimbursement) }} aus Abrechnung
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
/* The GiroCode keeps its place in the IBAN row even once there is nothing left
   to transfer: the mask sizes itself to its content, so a button that vanishes
   narrows the whole dialog while a payment date is being typed (issues.md
   0.13.0-5). Hidden, not removed — the space stays, the button does not. */
.eu-detail__qr.is-hidden {
  visibility: hidden;
}

/* The IBAN row replaces its value cell to carry the GiroCode button next to
   the number, so it repeats the inset of a plain readonly value below. */
.eu-detail__error {
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
