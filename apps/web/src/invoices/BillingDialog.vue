<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, forfeitsByRule } from '../contracts/api';
import { type BillingListDto, type InvoiceDto, listBillings } from './api';
import { unbilledSubmissions } from './eligibility';
import { usePresetToggle } from './forfeit-toggle';
import { euro, germanDate } from '../lib/format';

const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      submissionUID: string;
      billingUID?: string;
      newBilling?: { billingDate: string; billingNumber: string };
      reimbursement: number;
      receiptNumber?: string;
      /** For a new billing always set; for an existing one only when it changes. */
      forfeitsBonus?: boolean;
    },
  ];
}>();

const submissionUID = ref('');
const existingBillings = ref<BillingListDto[]>([]);
const mode = ref<'new' | 'existing'>('new');
const selectedBilling = ref('');
const billingDate = ref('');
const billingNumber = ref('');
const reimbursement = ref<number | null>(null);
const receiptNumber = ref('');
const localError = ref<string | null>(null);

const billingOptions = computed(() =>
  existingBillings.value.map((b) => ({
    value: b.billingUID,
    label: `${b.billingNumber} (${b.billingDate})`,
  })),
);

/** Every policy the invoice was submitted to; the billing belongs to one of them. */
const submissionOptions = computed(() =>
  (props.invoice?.submissions ?? []).map((s) => ({
    value: s.submissionUID,
    label: `${s.contractNumber} · ${s.companyName}`,
    hint: `eingereicht am ${germanDate(s.submittedDate)}${
      s.status === 'abgerechnet' ? `, bereits ${euro(s.reimbursed)} erstattet` : ''
    }`,
  })),
);

const selectedSubmission = computed(() =>
  props.invoice?.submissions.find((s) => s.submissionUID === submissionUID.value),
);
const chosenBilling = computed(() =>
  mode.value === 'existing'
    ? existingBillings.value.find((b) => b.billingUID === selectedBilling.value)
    : undefined,
);
const storedForfeit = computed(() => chosenBilling.value?.forfeitsBonus ?? null);

/**
 * Preset of the toggle. An existing billing keeps its stored choice, except
 * that under "erst durch Erstattung" a reimbursement > 0 turns a stored "no"
 * into a suggested "yes" — that "no" usually just came from a 0 € first entry.
 */
const forfeit = usePresetToggle(() => {
  const rule = selectedSubmission.value?.bonusForfeitRule ?? 'ON_REIMBURSEMENT';
  // What the billing already reimbursed counts as much as the new amount.
  const total = (chosenBilling.value?.reimbursedTotal ?? 0) + (reimbursement.value ?? 0);
  const byRule = forfeitsByRule(rule, total);
  const stored = storedForfeit.value;
  if (stored === null) return byRule;
  return stored || (rule === 'ON_REIMBURSEMENT' && byRule);
});

// Another billing or policy means another stored choice: drop the user's flip.
watch([mode, selectedBilling, submissionUID], () => forfeit.reset());

async function loadBillings(): Promise<void> {
  mode.value = 'new';
  selectedBilling.value = '';
  existingBillings.value = submissionUID.value ? await listBillings(submissionUID.value) : [];
  if (existingBillings.value.length > 0) {
    mode.value = 'existing';
    selectedBilling.value = existingBillings.value[0].billingUID;
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.invoice) return;
    localError.value = null;
    billingDate.value = new Date().toISOString().slice(0, 10);
    billingNumber.value = '';
    reimbursement.value = null;
    receiptNumber.value = '';
    // Default to the policy still waiting for its answer.
    const waiting = unbilledSubmissions(props.invoice);
    submissionUID.value =
      waiting[0]?.submissionUID ?? props.invoice.submissions[0]?.submissionUID ?? '';
    await loadBillings();
    forfeit.reset();
  },
  { immediate: true },
);

function selectSubmission(uid: string | null): void {
  submissionUID.value = uid ?? '';
  void loadBillings();
}

function submit(): void {
  localError.value = null;
  if (!submissionUID.value) {
    localError.value = 'Bitte die Police wählen.';
    return;
  }
  if (reimbursement.value === null) {
    localError.value = 'Bitte den Erstattungsbetrag angeben.';
    return;
  }
  // Checked here as well as on the server, so a new billing is not created
  // only for its allocation to be rejected afterwards.
  if (
    props.invoice &&
    Math.round(reimbursement.value * 100) > Math.round(props.invoice.remainingAmount * 100)
  ) {
    localError.value = `Die Erstattungen aller Policen dürfen zusammen den Rechnungsbetrag nicht übersteigen (noch offen: ${euro(props.invoice.remainingAmount)}).`;
    return;
  }
  const common = {
    submissionUID: submissionUID.value,
    reimbursement: reimbursement.value,
    ...(receiptNumber.value.trim() ? { receiptNumber: receiptNumber.value.trim() } : {}),
  };

  if (mode.value === 'existing') {
    if (!selectedBilling.value) {
      localError.value = 'Bitte eine Abrechnung wählen.';
      return;
    }
    const changed = forfeit.value.value !== storedForfeit.value;
    emit('submit', {
      billingUID: selectedBilling.value,
      ...common,
      ...(changed ? { forfeitsBonus: forfeit.value.value } : {}),
    });
    return;
  }

  if (!billingDate.value || !billingNumber.value.trim()) {
    localError.value = 'Bitte Abrechnungsdatum und -nummer angeben.';
    return;
  }
  emit('submit', {
    newBilling: { billingDate: billingDate.value, billingNumber: billingNumber.value.trim() },
    ...common,
    forfeitsBonus: forfeit.value.value,
  });
}
</script>

<template>
  <EuDialog :open="open" title="Abrechnung zuordnen" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="invoice" class="eu-form__note">
        Rechnung {{ invoice.invoiceNumber }} über {{ euro(invoice.invoiceAmount)
        }}<template v-if="invoice.reimbursedTotal > 0"
          >, noch nicht erstattet: {{ euro(invoice.remainingAmount) }}</template
        >
      </p>

      <EuEntityPicker
        v-if="submissionOptions.length > 1"
        :model-value="submissionUID || null"
        label="Police"
        required
        :options="submissionOptions"
        @update:model-value="selectSubmission"
      />

      <div
        v-if="existingBillings.length > 0"
        class="eu-form__modes"
        role="radiogroup"
        aria-label="Abrechnung"
      >
        <label><input v-model="mode" type="radio" value="existing" /> Bestehende Abrechnung</label>
        <label><input v-model="mode" type="radio" value="new" /> Neue Abrechnung</label>
      </div>

      <EuEntityPicker
        v-if="mode === 'existing'"
        :model-value="selectedBilling || null"
        label="Leistungsabrechnung"
        required
        :options="billingOptions"
        @update:model-value="selectedBilling = $event ?? ''"
      />
      <template v-else>
        <EuTextField v-model="billingDate" label="Abrechnungsdatum" type="date" />
        <EuTextField v-model="billingNumber" label="Abrechnungsnummer" />
      </template>

      <EuCurrencyField v-model="reimbursement" label="Erstattungsbetrag" />
      <EuTextField v-model="receiptNumber" label="Belegnummer" />
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
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Speichern' }}
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

.eu-form__hint {
  margin: 0.35rem 0 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-form__modes {
  display: flex;
  gap: 1rem;
  font-family: var(--eu-font-data);
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
