<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { PremiumDto, PremiumInput } from './api';

/**
 * Create/edit form for one premium (Beitragsstand) of a policy. It holds two
 * figures: the full monthly premium, as information on the cost, and the
 * bonus-relevant part that the factor steps of the bonus scale multiply
 * (Slice 76). Either may stay empty, not both.
 */
const props = defineProps<
  FormDialogProps & {
    /** The entry being edited, or null to record a new premium adjustment. */
    entry: PremiumDto | null;
    /** Earliest allowed start (the contract begin). */
    minDate: string;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: PremiumInput] }>();

const { t } = useI18n();

const validFrom = ref('');
const monthlyPremium = ref<number | null>(null);
const bonusRelevantPremium = ref<number | null>(null);
const note = ref('');

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const entry = props.entry;
    validFrom.value = entry?.validFrom ?? '';
    monthlyPremium.value = entry?.monthlyPremium ?? null;
    bonusRelevantPremium.value = entry?.bonusRelevantPremium ?? null;
    note.value = entry?.note ?? '';
  },
  () => props.entry,
);

function submit(): void {
  clear();
  if (!validFrom.value) return fail(t('contracts.premiums.validFromRequired'));
  if (monthlyPremium.value === null && bonusRelevantPremium.value === null) {
    return fail(t('contracts.premiums.amountRequired'));
  }
  if (validFrom.value < props.minDate) {
    return fail(t('contracts.premiums.beforeBegin'));
  }
  emit('submit', {
    validFrom: validFrom.value,
    monthlyPremium: monthlyPremium.value,
    bonusRelevantPremium: bonusRelevantPremium.value,
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="entry ? t('contracts.premiums.editTitle') : t('contracts.premiums.add')"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <EuTextField v-model="validFrom" :label="t('fields.validFrom')" type="date" />
      <EuCurrencyField v-model="monthlyPremium" :label="t('contracts.premiums.monthlyOptional')" />
      <EuCurrencyField v-model="bonusRelevantPremium" :label="t('fields.bonusRelevantPremium')" />
      <p class="eu-form__note">{{ t('contracts.premiums.relevantNote') }}</p>
      <EuTextField v-model="note" :label="t('contracts.premiums.noteLabel')" />
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? t('common.saving') : t('common.save')
      }}</EuButton>
    </template>
  </EuDialog>
</template>
