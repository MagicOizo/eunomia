<script setup lang="ts">
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, forfeitsByRule } from '../contracts/api';
import { euro, germanDate, plural } from '../lib/format';
import {
  type BillingDto,
  type BillingListDto,
  type InvoiceDto,
  listAccountInvoices,
  searchBillings,
} from './api';
import BillingFormDialog from './BillingFormDialog.vue';
import BillingSearchDialog from './BillingSearchDialog.vue';
import { commonSubmissions } from './eligibility';
import { usePresetToggle } from './forfeit-toggle';

/**
 * "Abrechnung zuordnen": books the reimbursements of one Leistungsabrechnung
 * onto the invoices of a submission — one invoice or several in one go. The
 * billing is picked by number (with search and ad-hoc create beside the field),
 * every invoice gets its own card with the amount it was reimbursed, and
 * further invoices of the same submission can be taken along.
 */
const props = defineProps<{
  open: boolean;
  /** The invoices to book; they must share a submission (see eligibility.ts). */
  invoices: InvoiceDto[];
  /** Preselected submission (policy) when opened from one card. */
  presetSubmission?: string | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      billingUID: string;
      entries: Array<{ invoiceUID: string; reimbursement: number; receiptNumber?: string }>;
      /** Only set when it differs from what the billing stores. */
      forfeitsBonus?: boolean;
    },
  ];
}>();

interface EntryInput {
  reimbursement: number | null;
  receiptNumber: string;
}

const rows = ref<InvoiceDto[]>([]);
const entries = reactive<Record<string, EntryInput>>({});
const submissionUID = ref('');
const billings = ref<BillingListDto[]>([]);
const selectedBilling = ref('');
const accountInvoices = ref<InvoiceDto[]>([]);
const localError = ref<string | null>(null);

const searchOpen = ref(false);
const createOpen = ref(false);
const createPrefill = ref('');

/** Every policy all the invoices went to; the billing belongs to one of them. */
const submissionOptions = computed(() =>
  commonSubmissions(rows.value).map((s) => ({
    value: s.submissionUID,
    label: `${s.contractNumber} · ${s.companyName}`,
    hint: `eingereicht am ${germanDate(s.submittedDate)}`,
  })),
);

const selectedSubmission = computed(() =>
  commonSubmissions(rows.value).find((s) => s.submissionUID === submissionUID.value),
);

const billingOptions = computed(() =>
  billings.value.map((b) => ({
    value: b.billingUID,
    label: b.billingNumber,
    hint: germanDate(b.billingDate),
  })),
);

const chosenBilling = computed(() =>
  billings.value.find((b) => b.billingUID === selectedBilling.value),
);

/** Invoices of the chosen submission that are not on a card yet. */
const addableInvoices = computed(() => {
  const taken = new Set(rows.value.map((i) => i.invoiceUID));
  return accountInvoices.value.filter(
    (invoice) =>
      !taken.has(invoice.invoiceUID) &&
      !invoice.reimbursementClosed &&
      invoice.submissions.some((s) => s.submissionUID === submissionUID.value),
  );
});

const addOptions = computed(() =>
  addableInvoices.value.map((invoice) => ({
    value: invoice.invoiceUID,
    label: invoice.invoiceNumber,
    hint: `${germanDate(invoice.invoiceDate)} · offen ${euro(invoice.remainingAmount)}`,
  })),
);

const enteredTotal = computed(() =>
  rows.value.reduce((sum, invoice) => sum + (entries[invoice.invoiceUID]?.reimbursement ?? 0), 0),
);

const storedForfeit = computed(() => chosenBilling.value?.forfeitsBonus ?? null);

/**
 * Preset of the toggle. An existing billing keeps its stored choice, except
 * that under "erst durch Erstattung" a reimbursement > 0 turns a stored "no"
 * into a suggested "yes" — that "no" usually just came from a 0 € first entry.
 */
const forfeit = usePresetToggle(() => {
  const rule = selectedSubmission.value?.bonusForfeitRule ?? 'ON_REIMBURSEMENT';
  // What the billing already reimbursed counts as much as the new amounts.
  const total = (chosenBilling.value?.reimbursedTotal ?? 0) + enteredTotal.value;
  const byRule = forfeitsByRule(rule, total);
  const stored = storedForfeit.value;
  if (stored === null) return byRule;
  return stored || (rule === 'ON_REIMBURSEMENT' && byRule);
});

// Another billing or policy means another stored choice: drop the user's flip.
watch([selectedBilling, submissionUID], () => forfeit.reset());

function resetEntries(): void {
  for (const key of Object.keys(entries)) delete entries[key];
  for (const invoice of rows.value) {
    entries[invoice.invoiceUID] = { reimbursement: null, receiptNumber: '' };
  }
}

async function loadBillings(): Promise<void> {
  billings.value = submissionUID.value
    ? await searchBillings({ submissionUID: submissionUID.value })
    : [];
  // One candidate needs no choosing; more than one is the user's call.
  selectedBilling.value = billings.value.length === 1 ? billings.value[0].billingUID : '';
}

watch(
  () => props.open,
  async (open) => {
    if (!open || props.invoices.length === 0) return;
    localError.value = null;
    rows.value = [...props.invoices];
    resetEntries();
    const shared = commonSubmissions(rows.value);
    // The card the dialog was opened from wins; otherwise default to the
    // policy still waiting for its answer.
    submissionUID.value =
      props.presetSubmission ??
      shared.find((s) => s.status === 'eingereicht')?.submissionUID ??
      shared[0]?.submissionUID ??
      '';
    await loadBillings();
    forfeit.reset();
    accountInvoices.value = await listAccountInvoices(rows.value[0].accountUID);
  },
  { immediate: true },
);

function selectSubmission(uid: string | null): void {
  submissionUID.value = uid ?? '';
  void loadBillings();
}

function addInvoice(uid: string | null): void {
  const invoice = addableInvoices.value.find((i) => i.invoiceUID === uid);
  if (!invoice) return;
  rows.value = [...rows.value, invoice];
  entries[invoice.invoiceUID] = { reimbursement: null, receiptNumber: '' };
}

function removeInvoice(uid: string): void {
  if (rows.value.length <= 1) return;
  rows.value = rows.value.filter((i) => i.invoiceUID !== uid);
  delete entries[uid];
}

function onBillingCreated(billing: BillingDto): void {
  billings.value = [
    { ...billing, reimbursedTotal: 0, invoiceCount: 0, invoiceNumbers: null } as BillingListDto,
    ...billings.value,
  ];
  selectedBilling.value = billing.billingUID;
  createOpen.value = false;
}

function onBillingFound(billing: BillingListDto): void {
  if (!billings.value.some((b) => b.billingUID === billing.billingUID)) {
    billings.value = [billing, ...billings.value];
  }
  selectedBilling.value = billing.billingUID;
  searchOpen.value = false;
}

function submit(): void {
  localError.value = null;
  if (!submissionUID.value) {
    localError.value = 'Bitte die Police wählen.';
    return;
  }
  if (!selectedBilling.value) {
    localError.value = 'Bitte eine Leistungsabrechnung wählen, suchen oder anlegen.';
    return;
  }
  const missing = rows.value.filter((i) => entries[i.invoiceUID]?.reimbursement === null);
  if (missing.length > 0) {
    localError.value = `Bitte den Erstattungsbetrag angeben für: ${missing
      .map((i) => i.invoiceNumber)
      .join(', ')}.`;
    return;
  }
  // Checked here as well as on the server, so a booking is not attempted only
  // to be rejected as a whole for one amount.
  const exceeding = rows.value.filter(
    (invoice) =>
      Math.round((entries[invoice.invoiceUID]?.reimbursement ?? 0) * 100) >
      Math.round(invoice.remainingAmount * 100),
  );
  if (exceeding.length > 0) {
    localError.value = `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen — zu viel bei: ${exceeding
      .map((i) => `${i.invoiceNumber} (noch offen: ${euro(i.remainingAmount)})`)
      .join(', ')}.`;
    return;
  }

  const changed = forfeit.value.value !== storedForfeit.value;
  emit('submit', {
    billingUID: selectedBilling.value,
    entries: rows.value.map((invoice) => {
      const input = entries[invoice.invoiceUID];
      return {
        invoiceUID: invoice.invoiceUID,
        reimbursement: input.reimbursement ?? 0,
        ...(input.receiptNumber.trim() ? { receiptNumber: input.receiptNumber.trim() } : {}),
      };
    }),
    ...(changed ? { forfeitsBonus: forfeit.value.value } : {}),
  });
}
</script>

<template>
  <EuDialog :open="open" title="Abrechnung zuordnen" wide @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p class="eu-form__note">
        {{ plural(rows.length, 'Rechnung wird', 'Rechnungen werden') }} über diese
        Leistungsabrechnung erstattet.
      </p>

      <p v-if="submissionOptions.length === 0" class="eu-form__note" role="status">
        Diese Rechnungen haben keine gemeinsame Einreichung — eine Leistungsabrechnung kann nur
        Rechnungen ihrer eigenen Einreichung erstatten.
      </p>

      <EuEntityPicker
        v-else-if="submissionOptions.length > 1"
        :model-value="submissionUID || null"
        label="Police"
        required
        :options="submissionOptions"
        @update:model-value="selectSubmission"
      />

      <EuEntityPicker
        :model-value="selectedBilling || null"
        label="Leistungsabrechnung"
        required
        allow-search
        allow-create
        create-noun="Leistungsabrechnung"
        :disabled="!submissionUID"
        :options="billingOptions"
        @update:model-value="selectedBilling = $event ?? ''"
        @search="
          createPrefill = $event;
          searchOpen = true;
        "
        @create="
          createPrefill = $event;
          createOpen = true;
        "
      />
      <p class="eu-form__readonly">
        Abrechnungsdatum:
        <strong>{{ chosenBilling ? germanDate(chosenBilling.billingDate) : '–' }}</strong>
      </p>

      <ul class="eu-bill__cards">
        <li v-for="invoice in rows" :key="invoice.invoiceUID" class="eu-bill__card">
          <div class="eu-bill__head">
            <span class="eu-bill__number">{{ invoice.invoiceNumber }}</span>
            <span class="eu-bill__meta">
              {{ germanDate(invoice.invoiceDate) }} · {{ euro(invoice.invoiceAmount) }} · noch offen
              {{ euro(invoice.remainingAmount) }}
            </span>
            <EuButton
              v-if="rows.length > 1"
              variant="ghost"
              icon-only
              :icon="faTrash"
              :aria-label="`Rechnung ${invoice.invoiceNumber} nicht mitbuchen`"
              :title="`Rechnung ${invoice.invoiceNumber} nicht mitbuchen`"
              @click="removeInvoice(invoice.invoiceUID)"
            />
          </div>
          <div class="eu-bill__fields">
            <EuCurrencyField
              v-model="entries[invoice.invoiceUID].reimbursement"
              :label="`Erstattung (${invoice.invoiceNumber})`"
            />
            <EuTextField
              v-model="entries[invoice.invoiceUID].receiptNumber"
              :label="`Belegnummer (${invoice.invoiceNumber})`"
            />
          </div>
        </li>
      </ul>

      <EuEntityPicker
        v-if="addOptions.length > 0"
        :model-value="null"
        label="Weitere Rechnung dieser Einreichung"
        :options="addOptions"
        @update:model-value="addInvoice"
      />

      <div>
        <EuToggle
          :model-value="forfeit.value.value"
          label="Diese Abrechnung verwirkt den Bonus"
          @update:model-value="forfeit.set"
        />
        <p v-if="selectedSubmission" class="eu-form__hint">
          Regel der Police: Bonus verfällt
          {{ BONUS_FORFEIT_RULE_LABEL[selectedSubmission.bonusForfeitRule] }}.
        </p>
      </div>
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting || submissionOptions.length === 0" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
      </EuButton>
    </template>
  </EuDialog>

  <BillingSearchDialog
    v-if="selectedSubmission"
    :open="searchOpen"
    :submission-u-i-d="submissionUID"
    :policy-label="`${selectedSubmission.contractNumber} · ${selectedSubmission.companyName}`"
    :initial-query="createPrefill"
    @close="searchOpen = false"
    @select="onBillingFound"
  />

  <BillingFormDialog
    v-if="selectedSubmission"
    :open="createOpen"
    :submission-u-i-d="submissionUID"
    :bonus-forfeit-rule="selectedSubmission.bonusForfeitRule"
    :preset-number="createPrefill"
    @close="createOpen = false"
    @created="onBillingCreated"
  />
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

.eu-form__readonly {
  margin: -0.5rem 0 0;
  font-family: var(--eu-font-data);
  color: var(--eu-color-text-muted);
}

.eu-form__hint {
  margin: 0.35rem 0 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}

.eu-bill__cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.eu-bill__card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
}

.eu-bill__head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  font-family: var(--eu-font-data);
}

.eu-bill__number {
  font-weight: 600;
}

.eu-bill__meta {
  flex: 1;
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
}

.eu-bill__fields {
  display: flex;
  gap: 0.75rem;
}

.eu-bill__fields > * {
  flex: 1;
  min-width: 0;
}
</style>
