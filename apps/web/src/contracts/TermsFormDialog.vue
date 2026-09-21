<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import type { TermsDto, TermsInput } from './api';

/**
 * Create/edit form for a policy's yearly terms (Konditionen). Terms apply from
 * a calendar year until the next entry — the deductible is an annual figure
 * and never changes mid-year.
 */
const props = defineProps<{
  open: boolean;
  /** The entry being edited, or null to record terms from a new year. */
  entry: TermsDto | null;
  /** Earliest allowed year (the contract's begin year); also the default for the first entry. */
  minYear: number;
  /** Suggested year for a new entry. */
  suggestedYear: number;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: TermsInput] }>();

const validFromYear = ref('');
const deductible = ref<number | null>(null);
const reimbursementCap = ref<number | null>(null);
const reimbursementRate = ref('');
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.entry] as const,
  ([open, entry]) => {
    if (!open) return;
    localError.value = null;
    validFromYear.value = String(entry?.validFromYear ?? props.suggestedYear);
    deductible.value = entry?.deductible ?? null;
    reimbursementCap.value = entry?.reimbursementCap ?? null;
    reimbursementRate.value = String(entry?.reimbursementRate ?? 100);
  },
  { immediate: true },
);

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
  emit('submit', {
    validFromYear: year,
    deductible: deductible.value ?? 0,
    reimbursementCap: reimbursementCap.value,
    reimbursementRate: rate,
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
      <EuTextField v-model="validFromYear" label="Gültig ab Jahr" type="number" />
      <EuCurrencyField v-model="deductible" label="Selbstbeteiligung pro Jahr" />
      <EuCurrencyField
        v-model="reimbursementCap"
        label="Erstattungsobergrenze pro Jahr (leer = keine)"
      />
      <EuTextField v-model="reimbursementRate" label="Erstattungssatz (%)" type="number" />
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

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
