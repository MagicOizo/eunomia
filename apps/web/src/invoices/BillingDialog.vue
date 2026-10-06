<script setup lang="ts">
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, forfeitsByRule } from '../contracts/api';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { formatDate, formatMoney } from '../lib/format';
import {
  type BillingDto,
  type BillingListDto,
  type InvoiceDto,
  listAccountInvoices,
  searchBillings,
} from './api';
import BillingFormDialog from './BillingFormDialog.vue';
import BillingSearchDialog from './BillingSearchDialog.vue';
import { type CommonPolicy, commonPolicies, policyLabel } from './eligibility';
import { usePresetToggle } from './forfeit-toggle';

/**
 * "Abrechnung zuordnen": books the reimbursements of one Leistungsabrechnung
 * onto invoices — one or several in one go. The billing is picked by number
 * (with search and ad-hoc create beside the field), every invoice gets its own
 * card with the amount it was reimbursed, and further invoices can be taken
 * along. Everything runs per policy, which is what a billing belongs to: one
 * letter of the insurer regularly answers invoices handed in on different days,
 * so a booking may mix submissions (Slice 37). Each card therefore names the day
 * its invoice was handed in.
 *
 * A card can also mark its invoice "als abgerechnet" in the same step (issues.md
 * 0.15.0-4) — the letter is often known to be the last word on it. Where the
 * amount covers what is open, the switch stands on and locked and is not sent:
 * the invoice is abgerechnet by its amount, and a stored mark would outlive a
 * later correction of that amount.
 */
const props = defineProps<
  FormDialogProps & {
    /** The invoices to book; they must share a policy (see eligibility.ts). */
    invoices: InvoiceDto[];
    /**
     * The policy when it does not follow from the invoices — opened from the
     * Leistungsabrechnungen page, the dialog starts with no card at all and the
     * invoices are picked here. Fixes the policy, so the picker offers no other.
     */
    policy?: (CommonPolicy & { accountUID: string }) | null;
    /** facilityUID → name, for the provider on each invoice card. */
    facilityNames: Record<string, string>;
    /** Preselected policy when opened from one card or from a billing. */
    presetContract?: string | null;
    /** Billing to preselect — the one just created from the contract side. */
    presetBilling?: string | null;
  }
>();

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      billingUID: string;
      entries: Array<{
        invoiceUID: string;
        reimbursement: number;
        receiptNumber?: string;
        reimbursementClosed?: true;
      }>;
      /** Only set when it differs from what the billing stores. */
      forfeitsBonus?: boolean;
    },
  ];
}>();

const { t } = useI18n();

interface EntryInput {
  reimbursement: number | null;
  receiptNumber: string;
  /** The user's "als abgerechnet markieren"; see fullyCovered() for when it is moot. */
  close: boolean;
}

const emptyEntry = (): EntryInput => ({ reimbursement: null, receiptNumber: '', close: false });

const rows = ref<InvoiceDto[]>([]);
const entries = reactive<Record<string, EntryInput>>({});
const contractUID = ref('');
const billings = ref<BillingListDto[]>([]);
const selectedBilling = ref('');
const accountInvoices = ref<InvoiceDto[]>([]);

/**
 * The invoice number in a card's header names that card's two fields (see the
 * group below), instead of being repeated in both labels: a long number broke
 * into a second line there and pushed "Erstattung" and "Belegnummer" out of
 * line with each other.
 */
const cardId = useId();
const numberId = (invoiceUID: string): string => `${cardId}-${invoiceUID}`;

const searchOpen = ref(false);
const createOpen = ref(false);
const createPrefill = ref('');

/**
 * The policies to choose from: every one all the invoices went to. A caller
 * that names the policy fixes it — the billing belongs to that one, whatever
 * else the invoices added along the way have in common.
 */
const availablePolicies = computed<CommonPolicy[]>(() =>
  props.policy ? [props.policy] : commonPolicies(rows.value),
);

/** The day this invoice was handed in at that policy; each reaches it once. */
function submittedAt(invoice: InvoiceDto, contract: string): string | undefined {
  return invoice.submissions.find((s) => s.contractUID === contract)?.submittedDate;
}

/**
 * When the invoices on the cards were handed in at a policy. A booking may span
 * submissions, so this names the day only where there is a single one.
 */
function submittedHint(contract: string): string | undefined {
  const days = [
    ...new Set(
      rows.value.map((invoice) => submittedAt(invoice, contract)).filter((d) => d !== undefined),
    ),
  ];
  if (days.length === 0) return undefined;
  return days.length === 1
    ? t('invoices.submission.submittedOn', { date: formatDate(days[0]) })
    : t('invoices.billing.submittedOnSeveralDays');
}

const policyOptions = computed(() =>
  availablePolicies.value.map((policy) => ({
    value: policy.contractUID,
    label: policyLabel(policy),
    hint: submittedHint(policy.contractUID),
  })),
);

const selectedPolicy = computed(() =>
  availablePolicies.value.find((policy) => policy.contractUID === contractUID.value),
);

const billingOptions = computed(() =>
  billings.value.map((b) => ({
    value: b.billingUID,
    label: b.billingNumber,
    hint: formatDate(b.billingDate),
  })),
);

const chosenBilling = computed(() =>
  billings.value.find((b) => b.billingUID === selectedBilling.value),
);

/**
 * Invoices submitted at the chosen policy that are not on a card yet — from any
 * of its submissions, which is what makes one letter bookable in one go.
 */
const addableInvoices = computed(() => {
  const taken = new Set(rows.value.map((i) => i.invoiceUID));
  return accountInvoices.value.filter(
    (invoice) =>
      !taken.has(invoice.invoiceUID) &&
      !invoice.reimbursementClosed &&
      invoice.submissions.some((s) => s.contractUID === contractUID.value),
  );
});

const addOptions = computed(() =>
  addableInvoices.value.map((invoice) => {
    const day = submittedAt(invoice, contractUID.value);
    return {
      value: invoice.invoiceUID,
      label: invoice.invoiceNumber,
      hint: [
        formatDate(invoice.invoiceDate),
        t('invoices.billing.openAmount', { amount: formatMoney(invoice.remainingAmount) }),
        ...(day ? [t('invoices.submission.submittedOn', { date: formatDate(day) })] : []),
      ].join(' · '),
    };
  }),
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
  const rule = selectedPolicy.value?.bonusForfeitRule ?? 'ON_REIMBURSEMENT';
  // What the billing already reimbursed counts as much as the new amounts.
  const total = (chosenBilling.value?.reimbursedTotal ?? 0) + enteredTotal.value;
  const byRule = forfeitsByRule(rule, total);
  const stored = storedForfeit.value;
  if (stored === null) return byRule;
  return stored || (rule === 'ON_REIMBURSEMENT' && byRule);
});

// Another billing or policy means another stored choice: drop the user's flip.
watch([selectedBilling, contractUID], () => forfeit.reset());

/**
 * An amount from the card's head goes straight into its reimbursement field
 * (issues.md 0.13.0-4). Both amounts shown there are worth taking: the full one
 * where the policy reimbursed everything, the open one where an earlier billing
 * already paid part of the bill.
 */
function takeAmount(invoiceUID: string, amount: number): void {
  const entry = entries[invoiceUID];
  if (entry) entry.reimbursement = amount;
}

/** Whether the amount entered on this card pays off everything still open. */
function fullyCovered(invoice: InvoiceDto): boolean {
  const amount = entries[invoice.invoiceUID]?.reimbursement ?? null;
  return amount !== null && Math.round(amount * 100) >= Math.round(invoice.remainingAmount * 100);
}

function resetEntries(): void {
  for (const key of Object.keys(entries)) delete entries[key];
  for (const invoice of rows.value) {
    entries[invoice.invoiceUID] = emptyEntry();
  }
}

async function loadBillings(): Promise<void> {
  // A billing belongs to the policy, not to one submission (Slice 37), so the
  // candidates are the policy's — including ones already answering another
  // submission of it.
  billings.value = selectedPolicy.value
    ? await searchBillings({ contractUID: selectedPolicy.value.contractUID })
    : [];
  // One candidate needs no choosing; more than one is the user's call.
  selectedBilling.value = billings.value.length === 1 ? billings.value[0].billingUID : '';
}

const { shownError, fail, clear } = useFormDialog(props, async () => {
  rows.value = [...props.invoices];
  resetEntries();
  const shared = availablePolicies.value;
  // The card the dialog was opened from wins; otherwise default to the policy
  // still waiting for an answer for one of these invoices.
  contractUID.value =
    shared.find((policy) => policy.contractUID === props.presetContract)?.contractUID ??
    shared.find((policy) =>
      rows.value.some((invoice) =>
        invoice.submissions.some(
          (s) => s.contractUID === policy.contractUID && s.status === 'eingereicht',
        ),
      ),
    )?.contractUID ??
    shared[0]?.contractUID ??
    '';
  await loadBillings();
  // Only here, not in loadBillings(): switching the policy afterwards must
  // not bring the preselection back.
  if (props.presetBilling) selectedBilling.value = props.presetBilling;
  forfeit.reset();
  // Without a card the account comes from the policy the dialog was opened
  // for — that is where the invoices to pick from live.
  const accountUID = rows.value[0]?.accountUID ?? props.policy?.accountUID;
  accountInvoices.value = accountUID ? await listAccountInvoices(accountUID) : [];
});

function selectPolicy(uid: string | null): void {
  contractUID.value = uid ?? '';
  void loadBillings();
}

function addInvoice(uid: string | null): void {
  const invoice = addableInvoices.value.find((i) => i.invoiceUID === uid);
  if (!invoice) return;
  // Every complaint so far named the cards, so changing them clears it instead
  // of leaving "please pick an invoice" standing over the invoice just picked.
  clear();
  rows.value = [...rows.value, invoice];
  entries[invoice.invoiceUID] = emptyEntry();
}

function removeInvoice(uid: string): void {
  // The last card may only go when the caller named the policy: otherwise the
  // dialog would lose the policy it draws its candidates from, with no way back.
  if (rows.value.length <= 1 && !props.policy) return;
  clear();
  rows.value = rows.value.filter((i) => i.invoiceUID !== uid);
  delete entries[uid];
}

function onBillingSaved(billing: BillingDto): void {
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
  clear();
  if (!contractUID.value) return fail(t('invoices.exclusion.contractRequired'));
  if (!selectedBilling.value) return fail(t('invoices.billing.billingRequired'));
  if (rows.value.length === 0) return fail(t('invoices.billing.invoiceRequired'));
  const missing = rows.value.filter((i) => entries[i.invoiceUID]?.reimbursement === null);
  if (missing.length > 0) {
    return fail(
      t('invoices.billing.amountMissing', {
        invoices: missing.map((i) => i.invoiceNumber).join(', '),
      }),
    );
  }
  // Checked here as well as on the server, so a booking is not attempted only
  // to be rejected as a whole for one amount.
  const exceeding = rows.value.filter(
    (invoice) =>
      Math.round((entries[invoice.invoiceUID]?.reimbursement ?? 0) * 100) >
      Math.round(invoice.remainingAmount * 100),
  );
  if (exceeding.length > 0) {
    return fail(
      t('invoices.billing.tooMuch', {
        invoices: exceeding
          .map((i) =>
            t('invoices.billing.tooMuchItem', {
              number: i.invoiceNumber,
              open: formatMoney(i.remainingAmount),
            }),
          )
          .join(', '),
      }),
    );
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
        ...(input.close && !fullyCovered(invoice) ? { reimbursementClosed: true as const } : {}),
      };
    }),
    ...(changed ? { forfeitsBonus: forfeit.value.value } : {}),
  });
}
</script>

<template>
  <EuDialog :open="open" :title="t('invoices.billing.title')" wide @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p class="eu-form__note">
        <template v-if="rows.length === 0">
          {{ t('invoices.billing.noInvoiceYet') }}
        </template>
        <template v-else>
          {{ t('invoices.billing.reimbursedThrough', rows.length) }}
        </template>
      </p>

      <p v-if="policyOptions.length === 0" class="eu-form__note" role="status">
        {{ t('invoices.billing.noCommonPolicy') }}
      </p>

      <EuEntityPicker
        v-else-if="policyOptions.length > 1"
        :model-value="contractUID || null"
        :label="t('fields.contractUID')"
        required
        :options="policyOptions"
        @update:model-value="selectPolicy"
      />

      <EuEntityPicker
        :model-value="selectedBilling || null"
        :label="t('invoices.billing.billing')"
        required
        allow-search
        allow-create
        :create-noun="t('invoices.billing.billing')"
        :disabled="!contractUID"
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
        {{ t('invoices.billing.billingDate') }}
        <strong>{{ chosenBilling ? formatDate(chosenBilling.billingDate) : '–' }}</strong>
      </p>

      <ul class="eu-bill__cards">
        <li v-for="invoice in rows" :key="invoice.invoiceUID" class="eu-bill__card">
          <div class="eu-bill__head">
            <span :id="numberId(invoice.invoiceUID)" class="eu-bill__number">
              {{ invoice.invoiceNumber }}
            </span>
            <span class="eu-bill__meta">
              {{
                (invoice.facilityUID && facilityNames[invoice.facilityUID]) ||
                t('invoices.billing.noFacility')
              }}
              · {{ formatDate(invoice.invoiceDate) }} ·
              <button
                type="button"
                class="eu-bill__take"
                :aria-label="
                  t('invoices.allocation.takeAmount', {
                    amount: formatMoney(invoice.invoiceAmount),
                  })
                "
                :title="
                  t('invoices.allocation.takeAmountHint', {
                    amount: formatMoney(invoice.invoiceAmount),
                  })
                "
                @click="takeAmount(invoice.invoiceUID, invoice.invoiceAmount)"
              >
                {{ formatMoney(invoice.invoiceAmount) }}
              </button>
              · {{ t('invoices.billing.stillOpen') }}
              <button
                type="button"
                class="eu-bill__take"
                :aria-label="
                  t('invoices.billing.takeOpen', { amount: formatMoney(invoice.remainingAmount) })
                "
                :title="
                  t('invoices.allocation.takeAmountHint', {
                    amount: formatMoney(invoice.remainingAmount),
                  })
                "
                @click="takeAmount(invoice.invoiceUID, invoice.remainingAmount)"
              >
                {{ formatMoney(invoice.remainingAmount) }}
              </button>
              <template v-if="submittedAt(invoice, contractUID)">
                ·
                {{
                  t('invoices.submission.submittedOn', {
                    date: formatDate(submittedAt(invoice, contractUID)!),
                  })
                }}
              </template>
            </span>
            <EuButton
              v-if="rows.length > 1 || policy"
              variant="ghost"
              icon-only
              :icon="faTrash"
              :aria-label="t('invoices.billing.dropInvoice', { number: invoice.invoiceNumber })"
              :title="t('invoices.billing.dropInvoice', { number: invoice.invoiceNumber })"
              @click="removeInvoice(invoice.invoiceUID)"
            />
          </div>
          <div class="eu-bill__entry" role="group" :aria-labelledby="numberId(invoice.invoiceUID)">
            <div class="eu-bill__fields">
              <EuCurrencyField
                v-model="entries[invoice.invoiceUID].reimbursement"
                :label="t('fields.reimbursement')"
              />
              <EuTextField
                v-model="entries[invoice.invoiceUID].receiptNumber"
                :label="t('fields.receiptNumber')"
              />
            </div>
            <div class="eu-bill__close">
              <EuToggle
                :model-value="fullyCovered(invoice) || entries[invoice.invoiceUID].close"
                :disabled="fullyCovered(invoice)"
                :label="t('invoices.billing.markSettled')"
                @update:model-value="entries[invoice.invoiceUID].close = $event"
              />
              <span v-if="fullyCovered(invoice)" class="eu-bill__covered">{{
                t('invoices.billing.fullyReimbursed')
              }}</span>
            </div>
          </div>
        </li>
      </ul>

      <EuEntityPicker
        v-if="addOptions.length > 0"
        :model-value="null"
        :label="rows.length === 0 ? t('invoices.billing.addFirst') : t('invoices.billing.addMore')"
        :options="addOptions"
        @update:model-value="addInvoice"
      />

      <div>
        <EuToggle
          :model-value="forfeit.value.value"
          :label="t('invoices.billingForm.forfeits')"
          @update:model-value="forfeit.set"
        />
        <p v-if="selectedPolicy" class="eu-form__hint">
          {{
            t('invoices.billingForm.rule', {
              rule: BONUS_FORFEIT_RULE_LABEL[selectedPolicy.bonusForfeitRule],
            })
          }}
        </p>
      </div>
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting || policyOptions.length === 0" @click="submit">
        {{ submitting ? t('common.saving') : t('common.save') }}
      </EuButton>
    </template>
  </EuDialog>

  <BillingSearchDialog
    v-if="selectedPolicy"
    :open="searchOpen"
    :contract-u-i-d="selectedPolicy.contractUID"
    :policy-label="policyLabel(selectedPolicy)"
    :initial-query="createPrefill"
    @close="searchOpen = false"
    @select="onBillingFound"
  />

  <BillingFormDialog
    v-if="selectedPolicy"
    :open="createOpen"
    :contract-u-i-d="selectedPolicy.contractUID"
    :bonus-forfeit-rule="selectedPolicy.bonusForfeitRule"
    :preset-number="createPrefill"
    @close="createOpen = false"
    @saved="onBillingSaved"
  />
</template>

<style scoped>
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

/* The two amounts in the card's head double as a shortcut into the field under
   them (issues.md 0.13.0-4): they read as the text they were, and only hover
   and focus say that there is something to click. */
.eu-bill__take {
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

.eu-bill__take:hover,
.eu-bill__take:focus-visible {
  color: var(--eu-color-accent-text);
  text-decoration-style: solid;
}

.eu-bill__entry {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.eu-bill__fields {
  display: flex;
  gap: 0.75rem;
}

/* Centred, not on the baseline: the toggle's baseline is its empty track, which
   dropped the note below the label's text. */
.eu-bill__close {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.eu-bill__covered {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-bill__fields > * {
  flex: 1;
  min-width: 0;
}
</style>
