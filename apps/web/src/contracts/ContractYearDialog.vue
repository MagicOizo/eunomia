<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { formatMoney } from '../lib/format';
import type { BonusYearDto, ContractYearInput } from './api';
import { forecastBasis } from './bonus-labels';

/**
 * Records what actually happened in one insurance year of a policy: the bonus
 * paid according to the insurer's letter (shown instead of the forecast) and,
 * where the counted result is wrong, a manual "bonus forfeited" override.
 * Emptying every field hands the year back to the calculation.
 */
const props = defineProps<FormDialogProps & { year: BonusYearDto | null }>();

const emit = defineEmits<{ close: []; submit: [payload: ContractYearInput] }>();

const { t } = useI18n();

const actualBonus = ref<number | null>(null);
const forfeitChoice = ref<'auto' | 'yes' | 'no'>('auto');
const note = ref('');

const forfeitOptions = computed(() => [
  { value: 'auto', label: t('contracts.yearDialog.forfeitAuto') },
  { value: 'yes', label: t('contracts.yearDialog.forfeitYes') },
  { value: 'no', label: t('contracts.yearDialog.forfeitNo') },
]);

/** The forecast for the year, with how a factor tier arrived at it. */
const forecast = computed(() => {
  const year = props.year;
  if (!year) return '';
  if (year.premiumMissing) return t('contracts.yearDialog.forecastPremiumMissing');
  if (year.expectedBonus === null) return t('contracts.yearDialog.forecastNoTerms');
  const amount = formatMoney(year.expectedBonus);
  const basis = year.forfeited ? null : forecastBasis(year);
  return basis ? t('contracts.yearDialog.forecastWithBasis', { amount, basis }) : amount;
});

const { shownError } = useFormDialog(
  props,
  () => {
    const year = props.year;
    if (!year) return;
    actualBonus.value = year.actualBonus;
    forfeitChoice.value =
      year.bonusForfeitedOverride === null ? 'auto' : year.bonusForfeitedOverride ? 'yes' : 'no';
    note.value = year.note ?? '';
  },
  () => props.year,
);

function submit(): void {
  emit('submit', {
    actualBonus: actualBonus.value,
    bonusForfeited: forfeitChoice.value === 'auto' ? null : forfeitChoice.value === 'yes',
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="t('contracts.yearDialog.title', { year: year?.year ?? '' })"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="year" class="eu-form__note">
        {{ t('contracts.yearDialog.forecast', { forecast }, year.claimFreeStreak) }}
      </p>
      <EuCurrencyField v-model="actualBonus" :label="t('contracts.yearDialog.actualBonus')" />
      <EuEntityPicker
        :model-value="forfeitChoice"
        :label="t('fields.bonusForfeited')"
        required
        :options="forfeitOptions"
        @update:model-value="forfeitChoice = ($event as 'auto' | 'yes' | 'no' | null) ?? 'auto'"
      />
      <EuTextField v-model="note" :label="t('contracts.yearDialog.noteOptional')" />
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
