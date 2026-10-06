<script setup lang="ts">
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { formatNumber } from '../lib/format';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { TermsDto, TermsInput } from './api';

/**
 * Create/edit form for a policy's yearly terms (Konditionen) and their bonus
 * scale. Terms apply from a calendar year until the next entry — the
 * deductible is an annual figure and never changes mid-year. The scale is
 * bound to the terms, so new bonus amounts mean a new entry; a new entry
 * starts as a copy of `template` ("vom Vorjahr übernehmen").
 *
 * A step is either a factor in monthly bonus-relevant premiums — the insurer's
 * standing rule, which carries on unchanged — or an amount in € (Slice 76).
 */
const props = defineProps<
  FormDialogProps & {
    /** The entry being edited, or null to record terms from a new year. */
    entry: TermsDto | null;
    /** Earliest allowed year (the contract's begin year); also the default for the first entry. */
    minYear: number;
    /** Suggested year for a new entry. */
    suggestedYear: number;
    /** Terms a new entry is prefilled from (usually the latest), or null. */
    template: TermsDto | null;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: TermsInput] }>();

const { t } = useI18n();

const validFromYear = ref('');
const deductible = ref<number | null>(null);
const reimbursementCap = ref<number | null>(null);
const reimbursementRate = ref('');
type TierKind = 'factor' | 'amount';

/** Scale rows as edited; `years` and `factor` stay strings until submit, like the year field. */
const tiers = ref<Array<{ years: string; kind: TierKind; factor: string; amount: number | null }>>(
  [],
);

const kindOptions = computed(() => [
  { value: 'factor', label: t('contracts.terms.kindFactor') },
  { value: 'amount', label: t('contracts.terms.kindAmount') },
]);

/** A factor as typed, "1,5" or "1.5"; NaN unless it is positive with at most two decimals. */
function parseFactor(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) return NaN;
  const value = Number(trimmed);
  return value > 0 ? value : NaN;
}
const copiedFrom = ref<number | null>(null);

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const entry = props.entry;
    const source = entry ?? props.template;
    copiedFrom.value = entry === null && source !== null ? source.validFromYear : null;
    validFromYear.value = String(entry?.validFromYear ?? props.suggestedYear);
    deductible.value = source?.deductible ?? null;
    reimbursementCap.value = source?.reimbursementCap ?? null;
    reimbursementRate.value = String(source?.reimbursementRate ?? 100);
    tiers.value = (source?.bonusTiers ?? []).map((tier) => ({
      years: String(tier.claimFreeYears),
      kind: tier.bonusFactor !== null ? 'factor' : 'amount',
      factor: tier.bonusFactor !== null ? formatNumber(tier.bonusFactor) : '',
      amount: tier.bonusAmount,
    }));
  },
  () => props.entry,
);

function addTier(): void {
  const last = tiers.value.at(-1);
  tiers.value.push({
    years: last ? String(Number(last.years) + 1) : '1',
    kind: last?.kind ?? 'factor',
    factor: '',
    amount: null,
  });
}

function submit(): void {
  clear();
  const year = Number(validFromYear.value);
  const rate = Number(reimbursementRate.value.replace(',', '.'));
  if (!Number.isInteger(year) || year < props.minYear) {
    return fail(t('contracts.terms.yearTooEarly', { year: props.minYear }));
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return fail(t('contracts.terms.rateRange'));
  }
  const bonusTiers = tiers.value.map((tier) => ({
    claimFreeYears: Number(tier.years),
    bonusAmount: tier.kind === 'amount' ? (tier.amount ?? NaN) : null,
    bonusFactor: tier.kind === 'factor' ? parseFactor(tier.factor) : null,
  }));
  if (
    bonusTiers.some(
      (tier) =>
        !Number.isInteger(tier.claimFreeYears) ||
        tier.claimFreeYears < 1 ||
        tier.claimFreeYears > 99 ||
        Number.isNaN(tier.bonusAmount) ||
        Number.isNaN(tier.bonusFactor),
    )
  ) {
    return fail(t('contracts.terms.tierInvalid'));
  }
  if (new Set(bonusTiers.map((tier) => tier.claimFreeYears)).size !== bonusTiers.length) {
    return fail(t('contracts.terms.tierDuplicate'));
  }
  bonusTiers.sort((a, b) => a.claimFreeYears - b.claimFreeYears);
  emit('submit', {
    validFromYear: year,
    deductible: deductible.value ?? 0,
    reimbursementCap: reimbursementCap.value,
    reimbursementRate: rate,
    bonusTiers,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="entry ? t('contracts.terms.editTitle') : t('contracts.terms.add')"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="copiedFrom !== null" class="eu-form__note">
        {{ t('contracts.terms.copiedFrom', { year: copiedFrom }) }}
      </p>
      <EuTextField v-model="validFromYear" :label="t('fields.validFromYear')" type="number" />
      <EuCurrencyField v-model="deductible" :label="t('contracts.terms.deductiblePerYear')" />
      <EuCurrencyField v-model="reimbursementCap" :label="t('contracts.terms.capPerYear')" />
      <EuTextField
        v-model="reimbursementRate"
        :label="t('contracts.terms.ratePercent')"
        type="number"
      />
      <fieldset class="eu-tiers">
        <legend>{{ t('contracts.terms.scaleLegend') }}</legend>
        <p class="eu-form__note">{{ t('contracts.terms.scaleNote') }}</p>
        <div v-for="(tier, index) in tiers" :key="index" class="eu-tiers__row">
          <EuTextField v-model="tier.years" :label="t('fields.claimFreeYears')" type="number" />
          <EuEntityPicker
            :model-value="tier.kind"
            :label="t('contracts.terms.tierKind')"
            required
            :options="kindOptions"
            @update:model-value="tier.kind = ($event as TierKind | null) ?? tier.kind"
          />
          <EuTextField
            v-if="tier.kind === 'factor'"
            v-model="tier.factor"
            :label="t('contracts.terms.kindFactor')"
          />
          <EuCurrencyField v-else v-model="tier.amount" :label="t('fields.bonusAmount')" />
          <EuButton
            variant="secondary"
            icon-only
            :icon="faTrash"
            :aria-label="t('contracts.terms.removeTier', { n: index + 1 })"
            @click="tiers.splice(index, 1)"
          />
        </div>
        <div>
          <EuButton variant="secondary" :icon="faPlus" @click="addTier">{{
            t('contracts.terms.addTier')
          }}</EuButton>
        </div>
      </fieldset>
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

<style scoped>
/* One size smaller than the shared note: this one carries a whole sentence. */
.eu-form__note {
  font-size: 0.9rem;
}

.eu-tiers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0.75rem 1rem 1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
}

.eu-tiers legend {
  padding: 0 0.35rem;
  font-family: var(--eu-font-heading);
}

.eu-tiers__row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.75rem;
}

@media (max-width: 480px) {
  .eu-tiers__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .eu-tiers__row > :nth-child(2),
  .eu-tiers__row > :nth-child(3) {
    grid-column: 1;
  }
}
</style>
