<script setup lang="ts">
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { todayIso } from '../lib/date-input';
import type { InvoiceDto } from './api';

const props = defineProps<{
  open: boolean;
  invoice: InvoiceDto | null;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [transferDate: string] }>();

const transferDate = ref('');
const localError = ref<string | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    localError.value = null;
    transferDate.value = props.invoice?.transferDate ?? todayIso();
  },
  { immediate: true },
);

function submit(): void {
  if (!transferDate.value) {
    localError.value = 'Bitte ein Zahlungsdatum wählen.';
    return;
  }
  emit('submit', transferDate.value);
}
</script>

<template>
  <EuDialog :open="open" title="Als bezahlt markieren" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="invoice" class="eu-form__note">
        Rechnung {{ invoice.invoiceNumber }} als erstattet/bezahlt markieren.
      </p>
      <EuTextField v-model="transferDate" label="Zahlungsdatum" type="date" />
      <p v-if="error ?? localError" class="eu-form__error" role="alert">
        {{ error ?? localError }}
      </p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Bestätigen' }}
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

.eu-form__note {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
