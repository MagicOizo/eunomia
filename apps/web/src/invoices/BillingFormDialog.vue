<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, type BonusForfeitRule, forfeitsByRule } from '../contracts/api';
import { describeError } from '../lib/errors';
import { type BillingDto, createBilling } from './api';
import { usePresetToggle } from './forfeit-toggle';

/**
 * Creates a Leistungsabrechnung under a known submission — the "＋" beside the
 * billing picker. It only records the letter that arrived; the reimbursements
 * it pays out are booked afterwards in the dialog that opened this one.
 */
const props = defineProps<{
  open: boolean;
  submissionUID: string;
  bonusForfeitRule: BonusForfeitRule;
  /** Prefills the number with what was typed into the picker. */
  presetNumber?: string;
}>();

const emit = defineEmits<{ close: []; created: [billing: BillingDto] }>();

const billingNumber = ref('');
const billingDate = ref('');
const documentLink = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

// No reimbursement is booked here yet, so the preset is what the rule alone
// says for a billing that pays out nothing; booking one afterwards can still
// turn it on in the dialog that opened this one.
const forfeit = usePresetToggle(() => forfeitsByRule(props.bonusForfeitRule, 0));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = null;
    billingNumber.value = props.presetNumber ?? '';
    billingDate.value = new Date().toISOString().slice(0, 10);
    documentLink.value = '';
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
  void (async () => {
    busy.value = true;
    try {
      const billing = await createBilling({
        submissionUID: props.submissionUID,
        billingNumber: billingNumber.value.trim(),
        billingDate: billingDate.value,
        documentLink: documentLink.value.trim() ? documentLink.value.trim() : null,
        forfeitsBonus: forfeit.value.value,
      });
      emit('created', billing);
    } catch (err) {
      error.value = describeError(err);
    } finally {
      busy.value = false;
    }
  })();
}
</script>

<template>
  <EuDialog :open="open" title="Neue Leistungsabrechnung" @close="emit('close')">
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
      <EuButton :disabled="busy" @click="save">{{ busy ? 'Anlegen…' : 'Anlegen' }}</EuButton>
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
