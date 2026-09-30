<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { iban } from '../lib/format';
import type { AgencyPaymentDetailDto, AgencyPaymentDetailInput } from './api';

/** Create/edit form for one set of an agency's payment details (Kontoverbindung). */
const props = defineProps<{
  open: boolean;
  /** The entry being edited, or null to add another set. */
  entry: AgencyPaymentDetailDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [payload: AgencyPaymentDetailInput] }>();

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
    // Shown grouped, as everywhere else; submit strips the spaces again.
    bankAccount.value = iban(entry?.bankAccount ?? '');
    bic.value = entry?.bic ?? '';
    recipientName.value = entry?.recipientName ?? '';
    note.value = entry?.note ?? '';
  },
  { immediate: true },
);

function submit(): void {
  localError.value = null;
  const compact = bankAccount.value.replace(/\s+/g, '').toUpperCase();
  if (compact === '') {
    localError.value = 'Bitte eine IBAN angeben.';
    return;
  }
  emit('submit', {
    bankAccount: compact,
    bic: bic.value.replace(/\s+/g, '').toUpperCase() || null,
    recipientName: recipientName.value.trim() || null,
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="entry ? 'Kontoverbindung bearbeiten' : 'Kontoverbindung hinzufügen'"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <!-- The explanations sit in the labels, as in the other forms of this
           kind: EuTextField has no hint of its own. -->
      <EuTextField v-model="bankAccount" label="IBAN" />
      <EuTextField v-model="bic" label="BIC (optional)" />
      <EuTextField v-model="recipientName" label="Empfänger (nur wenn abweichend)" />
      <EuTextField v-model="note" label="Notiz (z. B. wofür dieses Konto gilt)" />
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
