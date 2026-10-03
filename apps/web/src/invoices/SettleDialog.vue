<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { todayIso } from '../lib/date-input';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { InvoiceDto } from './api';

const props = defineProps<FormDialogProps & { invoice: InvoiceDto | null }>();

const emit = defineEmits<{ close: []; submit: [transferDate: string] }>();

const transferDate = ref('');

const { shownError, fail } = useFormDialog(props, () => {
  transferDate.value = props.invoice?.transferDate ?? todayIso();
});

function submit(): void {
  if (!transferDate.value) return fail('Bitte ein Zahlungsdatum wählen.');
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
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? 'Speichern…' : 'Bestätigen' }}
      </EuButton>
    </template>
  </EuDialog>
</template>
