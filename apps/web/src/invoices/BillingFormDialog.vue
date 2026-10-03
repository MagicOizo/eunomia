<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, type BonusForfeitRule, forfeitsByRule } from '../contracts/api';
import { todayIso } from '../lib/date-input';
import { describeError } from '../lib/errors';
import { type BillingDto, type BillingListDto, createBilling, updateBilling } from './api';
import { usePresetToggle } from './forfeit-toggle';

/**
 * The one dialog for a Leistungsabrechnung's own fields — number, date,
 * document link and the bonus-forfeit flag. It creates one (the "＋" beside the
 * billing picker, or "Neu" in the billing list) and edits an existing one. The
 * reimbursements it pays out are booked elsewhere, in BillingDialog.
 */
const props = defineProps<{
  open: boolean;
  /** The billing to edit; omitted for a new one. */
  billing?: BillingListDto | null;
  /** The policy a new billing belongs to. */
  contractUID?: string;
  bonusForfeitRule: BonusForfeitRule;
  /** Prefills the number with what was typed into the picker. */
  presetNumber?: string;
}>();

const emit = defineEmits<{ close: []; saved: [billing: BillingDto] }>();

const billingNumber = ref('');
const billingDate = ref('');
const documentLink = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

/**
 * Preset of the toggle. A new billing has reimbursed nothing yet, so the rule
 * alone decides; booking an amount afterwards can still turn it on in the
 * dialog that opened this one. An existing billing keeps its stored choice.
 */
const forfeit = usePresetToggle(() => {
  const billing = props.billing;
  if (!billing) return forfeitsByRule(props.bonusForfeitRule, 0);
  return billing.forfeitsBonus ?? forfeitsByRule(props.bonusForfeitRule, billing.reimbursedTotal);
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = null;
    const billing = props.billing;
    billingNumber.value = billing?.billingNumber ?? props.presetNumber ?? '';
    billingDate.value = billing?.billingDate ?? todayIso();
    documentLink.value = billing?.documentLink ?? '';
    forfeit.reset();
  },
  { immediate: true },
);

function save(): void {
  error.value = null;
  if (!billingNumber.value.trim() || !billingDate.value) {
    error.value = 'Bitte Abrechnungsnummer und -datum angeben.';
    return;
  }
  if (!props.billing && !props.contractUID) {
    error.value = 'Zu dieser Leistungsabrechnung fehlt die Police.';
    return;
  }
  const fields = {
    billingNumber: billingNumber.value.trim(),
    billingDate: billingDate.value,
    documentLink: documentLink.value.trim() ? documentLink.value.trim() : null,
    forfeitsBonus: forfeit.value.value,
  };
  void (async () => {
    busy.value = true;
    try {
      const billing = props.billing
        ? await updateBilling(props.billing.billingUID, fields)
        : await createBilling({ contractUID: props.contractUID as string, ...fields });
      emit('saved', billing);
    } catch (err) {
      error.value = describeError(err);
    } finally {
      busy.value = false;
    }
  })();
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="billing ? 'Abrechnung bearbeiten' : 'Neue Leistungsabrechnung'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="save">
      <EuTextField v-model="billingNumber" label="Abrechnungsnummer" />
      <EuTextField v-model="billingDate" label="Abrechnungsdatum" type="date" />
      <EuTextField v-model="documentLink" label="Dokument-Link (optional)" />
      <div>
        <EuToggle
          :model-value="forfeit.value.value"
          label="Diese Abrechnung verwirkt den Bonus"
          @update:model-value="forfeit.set"
        />
        <p class="eu-form__hint">
          Regel der Police: Bonus verfällt {{ BONUS_FORFEIT_RULE_LABEL[bonusForfeitRule] }}.
        </p>
      </div>
      <p v-if="error" class="eu-form__error" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="busy" @click="save">
        {{ billing ? (busy ? 'Speichern…' : 'Speichern') : busy ? 'Anlegen…' : 'Anlegen' }}
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
</style>
