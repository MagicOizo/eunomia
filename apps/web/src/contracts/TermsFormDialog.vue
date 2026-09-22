<script setup lang="ts">
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import type { TermsDto, TermsInput } from './api';

/**
 * Create/edit form for a policy's yearly terms (Konditionen) and their bonus
 * scale. Terms apply from a calendar year until the next entry — the
 * deductible is an annual figure and never changes mid-year. The scale is
 * bound to the terms, so new bonus amounts mean a new entry; a new entry
 * starts as a copy of `template` ("vom Vorjahr übernehmen").
 */
const props = defineProps<{
  open: boolean;
  /** The entry being edited, or null to record terms from a new year. */
  entry: TermsDto | null;
  /** Earliest allowed year (the contract's begin year); also the default for the first entry. */
  minYear: number;
  /** Suggested year for a new entry. */
  suggestedYear: number;
  /** Terms a new entry is prefilled from (usually the latest), or null. */
  template: TermsDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: TermsInput] }>();

const validFromYear = ref('');
const deductible = ref<number | null>(null);
const reimbursementCap = ref<number | null>(null);
const reimbursementRate = ref('');
/** Scale rows as edited; `years` stays a string until submit, like the year field. */
const tiers = ref<Array<{ years: string; amount: number | null }>>([]);
const copiedFrom = ref<number | null>(null);
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.entry] as const,
  ([open, entry]) => {
    if (!open) return;
    localError.value = null;
    const source = entry ?? props.template;
    copiedFrom.value = entry === null && source !== null ? source.validFromYear : null;
    validFromYear.value = String(entry?.validFromYear ?? props.suggestedYear);
    deductible.value = source?.deductible ?? null;
    reimbursementCap.value = source?.reimbursementCap ?? null;
    reimbursementRate.value = String(source?.reimbursementRate ?? 100);
    tiers.value = (source?.bonusTiers ?? []).map((tier) => ({
      years: String(tier.claimFreeYears),
      amount: tier.bonusAmount,
    }));
  },
  { immediate: true },
);

function addTier(): void {
  const last = tiers.value.at(-1);
  tiers.value.push({ years: last ? String(Number(last.years) + 1) : '1', amount: null });
}

function submit(): void {
  localError.value = null;
  const year = Number(validFromYear.value);
  const rate = Number(reimbursementRate.value.replace(',', '.'));
  if (!Number.isInteger(year) || year < props.minYear) {
    localError.value = `Bitte ein Jahr ab ${props.minYear} (Vertragsbeginn) angeben.`;
    return;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    localError.value = 'Der Erstattungssatz muss zwischen 0 und 100 % liegen.';
    return;
  }
  const bonusTiers = tiers.value.map((tier) => ({
    claimFreeYears: Number(tier.years),
    bonusAmount: tier.amount ?? NaN,
  }));
  if (
    bonusTiers.some(
      (tier) =>
        !Number.isInteger(tier.claimFreeYears) ||
        tier.claimFreeYears < 1 ||
        tier.claimFreeYears > 99 ||
        Number.isNaN(tier.bonusAmount),
    )
  ) {
    localError.value = 'Jede Bonus-Stufe braucht leistungsfreie Jahre (1–99) und einen Betrag.';
    return;
  }
  if (new Set(bonusTiers.map((tier) => tier.claimFreeYears)).size !== bonusTiers.length) {
    localError.value = 'Jede Anzahl leistungsfreier Jahre darf nur einmal vorkommen.';
    return;
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
    :title="entry ? 'Konditionen bearbeiten' : 'Konditionen ab Jahr erfassen'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="copiedFrom !== null" class="eu-form__note">
        Werte aus den Konditionen ab {{ copiedFrom }} übernommen – bitte prüfen und anpassen.
      </p>
      <EuTextField v-model="validFromYear" label="Gültig ab Jahr" type="number" />
      <EuCurrencyField v-model="deductible" label="Selbstbeteiligung pro Jahr" />
      <EuCurrencyField
        v-model="reimbursementCap"
        label="Erstattungsobergrenze pro Jahr (leer = keine)"
      />
      <EuTextField v-model="reimbursementRate" label="Erstattungssatz (%)" type="number" />
      <fieldset class="eu-tiers">
        <legend>Bonus-Staffel (Beitragsrückerstattung)</legend>
        <p class="eu-form__note">
          Absoluter Bonus je Stufe, gültig für die Jahre dieser Konditionen. Ohne Stufen hat die
          Police keinen Bonus.
        </p>
        <div v-for="(tier, index) in tiers" :key="index" class="eu-tiers__row">
          <EuTextField v-model="tier.years" label="Leistungsfreie Jahre" type="number" />
          <EuCurrencyField v-model="tier.amount" label="Bonus" />
          <EuButton
            variant="secondary"
            icon-only
            :icon="faTrash"
            :aria-label="`Bonus-Stufe ${index + 1} entfernen`"
            @click="tiers.splice(index, 1)"
          />
        </div>
        <div>
          <EuButton variant="secondary" :icon="faPlus" @click="addTier">Stufe hinzufügen</EuButton>
        </div>
      </fieldset>
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? 'Speichern…' : 'Speichern'
      }}</EuButton>
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.75rem;
}

@media (max-width: 480px) {
  .eu-tiers__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .eu-tiers__row > :nth-child(2) {
    grid-column: 1;
  }
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
