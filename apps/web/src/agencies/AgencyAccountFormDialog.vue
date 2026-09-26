<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import type { AgencyAccountDto, AgencyAccountInput } from './api';

/** Create/edit form for one bank account (Kontoverbindung) of an agency. */
const props = defineProps<{
  open: boolean;
  /** The entry being edited, or null to record a bank change. */
  entry: AgencyAccountDto | null;
  /** Prefilled start for a new entry — today, the usual day of a change. */
  suggestedDate: string;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: AgencyAccountInput] }>();

const validFrom = ref('');
const bankAccount = ref('');
const bic = ref('');
const recipientName = ref('');
const note = ref('');
const localError = ref<string | null>(null);

watch(
  () => [props.open, props.entry] as const,
  ([open, entry]) => {
    if (!open) return;
    localError.value = null;
    validFrom.value = entry ? (entry.validFrom ?? '') : props.suggestedDate;
    bankAccount.value = entry?.bankAccount ?? '';
    bic.value = entry?.bic ?? '';
    recipientName.value = entry?.recipientName ?? '';
    note.value = entry?.note ?? '';
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  const iban = bankAccount.value.replace(/\s+/g, '').toUpperCase();
  if (iban === '') {
    localError.value = 'Bitte eine IBAN angeben.';
    return;
  }
  emit('submit', {
    // Empty means "applies from the beginning" — the API stores that as null.
    validFrom: validFrom.value || null,
    bankAccount: iban,
    bic: bic.value.replace(/\s+/g, '').toUpperCase() || null,
    recipientName: recipientName.value.trim() || null,
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="entry ? 'Kontoverbindung bearbeiten' : 'Kontowechsel erfassen'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <!-- The explanations sit in the labels, as in the other history forms:
           EuTextField has no hint of its own, and an empty date is the one
           thing about this form that needs saying. -->
      <EuTextField v-model="validFrom" label="Gültig ab (leer = gilt von Anfang an)" type="date" />
      <EuTextField v-model="bankAccount" label="IBAN" />
      <EuTextField v-model="bic" label="BIC (optional)" />
      <EuTextField v-model="recipientName" label="Empfänger (nur wenn abweichend)" />
      <EuTextField v-model="note" label="Notiz (z. B. Anlass des Wechsels)" />
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
