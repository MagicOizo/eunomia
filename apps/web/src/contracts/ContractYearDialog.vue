<script setup lang="ts">
import { ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { germanMoney, plural } from '../lib/format';
import type { BonusYearDto, ContractYearInput } from './api';

/**
 * Records what actually happened in one insurance year of a policy: the bonus
 * paid according to the insurer's letter (shown instead of the forecast) and,
 * where the counted result is wrong, a manual "bonus forfeited" override.
 * Emptying every field hands the year back to the calculation.
 */
const props = defineProps<FormDialogProps & { year: BonusYearDto | null }>();

const emit = defineEmits<{ close: []; submit: [payload: ContractYearInput] }>();

const actualBonus = ref<number | null>(null);
const forfeitChoice = ref<'auto' | 'yes' | 'no'>('auto');
const note = ref('');

const forfeitOptions = [
  { value: 'auto', label: 'Automatisch aus den Einreichungen' },
  { value: 'yes', label: 'Ja, Bonus verwirkt' },
  { value: 'no', label: 'Nein, Jahr ist leistungsfrei' },
];

const { shownError } = useFormDialog(
  props,
  () => {
    const year = props.year;
    if (!year) return;
    actualBonus.value = year.actualBonus;
    forfeitChoice.value =
      year.bonusForfeitedOverride === null ? 'auto' : year.bonusForfeitedOverride ? 'yes' : 'no';
    note.value = year.note ?? '';
  },
  () => props.year,
);

function submit(): void {
  emit('submit', {
    actualBonus: actualBonus.value,
    bonusForfeited: forfeitChoice.value === 'auto' ? null : forfeitChoice.value === 'yes',
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <EuDialog :open="open" :title="`Jahr ${year?.year ?? ''} erfassen`" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <p v-if="year" class="eu-form__note">
        Prognose:
        {{
          year.expectedBonus === null
            ? 'keine Konditionen erfasst'
            : germanMoney(year.expectedBonus)
        }}
        bei {{ plural(year.claimFreeStreak, 'leistungsfreien Jahr', 'leistungsfreien Jahren') }} in
        Folge.
      </p>
      <EuCurrencyField
        v-model="actualBonus"
        label="Tatsächlich erhaltene Beitragsrückerstattung (laut Schreiben)"
      />
      <EuEntityPicker
        :model-value="forfeitChoice"
        label="Bonus verwirkt"
        required
        :options="forfeitOptions"
        @update:model-value="forfeitChoice = ($event as 'auto' | 'yes' | 'no' | null) ?? 'auto'"
      />
      <EuTextField v-model="note" label="Notiz (optional)" />
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
