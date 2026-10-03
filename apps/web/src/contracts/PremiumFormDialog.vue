<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { PremiumDto, PremiumInput } from './api';

/** Create/edit form for one premium (Beitragsstand) of a policy. */
const props = defineProps<
  FormDialogProps & {
    /** The entry being edited, or null to record a new premium adjustment. */
    entry: PremiumDto | null;
    /** Earliest allowed start (the contract begin). */
    minDate: string;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: PremiumInput] }>();

const validFrom = ref('');
const monthlyPremium = ref<number | null>(null);
const note = ref('');

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const entry = props.entry;
    validFrom.value = entry?.validFrom ?? '';
    monthlyPremium.value = entry?.monthlyPremium ?? null;
    note.value = entry?.note ?? '';
  },
  () => props.entry,
);

function submit(): void {
  clear();
  if (!validFrom.value || monthlyPremium.value === null) {
    return fail('Bitte „Gültig ab" und „Monatsbeitrag" ausfüllen.');
  }
  if (validFrom.value < props.minDate) {
    return fail('Ein Beitrag kann nicht vor Vertragsbeginn gelten.');
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
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Abbrechen</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? 'Speichern…' : 'Speichern'
      }}</EuButton>
    </template>
  </EuDialog>
</template>
