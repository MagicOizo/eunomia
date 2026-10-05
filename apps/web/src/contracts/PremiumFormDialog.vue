<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { PremiumDto, PremiumInput } from './api';

/**
 * Create/edit form for one premium (Beitragsstand) of a policy. It holds two
 * figures: the full monthly premium, as information on the cost, and the
 * bonus-relevant part that the factor steps of the bonus scale multiply
 * (Slice 76). Either may stay empty, not both.
 */
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
const bonusRelevantPremium = ref<number | null>(null);
const note = ref('');

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const entry = props.entry;
    validFrom.value = entry?.validFrom ?? '';
    monthlyPremium.value = entry?.monthlyPremium ?? null;
    bonusRelevantPremium.value = entry?.bonusRelevantPremium ?? null;
    note.value = entry?.note ?? '';
  },
  () => props.entry,
);

function submit(): void {
  clear();
  if (!validFrom.value) return fail('Bitte „Gültig ab" ausfüllen.');
  if (monthlyPremium.value === null && bonusRelevantPremium.value === null) {
    return fail('Bitte den Monatsbeitrag, den bonusrelevanten Beitrag oder beide angeben.');
  }
  if (validFrom.value < props.minDate) {
    return fail('Ein Beitrag kann nicht vor Vertragsbeginn gelten.');
  }
  emit('submit', {
    validFrom: validFrom.value,
    monthlyPremium: monthlyPremium.value,
    bonusRelevantPremium: bonusRelevantPremium.value,
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
      <EuCurrencyField v-model="monthlyPremium" label="Monatsbeitrag gesamt (optional)" />
      <EuCurrencyField v-model="bonusRelevantPremium" label="Bonusrelevanter Monatsbeitrag" />
      <p class="eu-form__note">
        Der bonusrelevante Beitrag ist der Teil, auf den die Versicherung die Beitragsrückerstattung
        rechnet – meist nur der Haupttarif. Bonus-Stufen in Monatsbeiträgen rechnen mit seinem
        Jahresdurchschnitt.
      </p>
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
