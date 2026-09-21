<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import type { PremiumDto, PremiumInput } from './api';

/** Create/edit form for one premium (Beitragsstand) of a policy. */
const props = defineProps<{
  open: boolean;
  /** The entry being edited, or null to record a new premium adjustment. */
  entry: PremiumDto | null;
  /** Earliest allowed start (the contract begin). */
  minDate: string;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: PremiumInput] }>();

const validFrom = ref('');
const monthlyPremium = ref<number | null>(null);
const note = ref('');
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.entry] as const,
  ([open, entry]) => {
    if (!open) return;
    localError.value = null;
    validFrom.value = entry?.validFrom ?? '';
    monthlyPremium.value = entry?.monthlyPremium ?? null;
    note.value = entry?.note ?? '';
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  if (!validFrom.value || monthlyPremium.value === null) {
    localError.value = 'Bitte „Gültig ab" und „Monatsbeitrag" ausfüllen.';
    return;
  }
  if (validFrom.value < props.minDate) {
    localError.value = 'Ein Beitrag kann nicht vor Vertragsbeginn gelten.';
    return;
  }
  emit('submit', {
    validFrom: validFrom.value,
    monthlyPremium: monthlyPremium.value,
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="entry ? 'Beitragsstand bearbeiten' : 'Beitragsanpassung erfassen'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <EuTextField v-model="validFrom" label="Gültig ab" type="date" />
      <EuCurrencyField v-model="monthlyPremium" label="Monatsbeitrag" />
      <EuTextField v-model="note" label="Notiz (z. B. Anlass der Anpassung)" />
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
