<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { SelectOption } from '../components/resource/EuSelectField.vue';

/** Marks an invoice as "not reimbursable under this policy". */
const props = defineProps<
  FormDialogProps & {
    /** Policies the invoice is neither submitted to nor already marked for. */
    contracts: SelectOption[];
  }
>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { contractUID: string; note: string | null }];
}>();

const { t } = useI18n();

const contractUID = ref('');
const note = ref('');

const { shownError, fail, clear } = useFormDialog(props, () => {
  contractUID.value = props.contracts.length === 1 ? props.contracts[0].value : '';
  note.value = '';
});

function submit(): void {
  clear();
  if (!contractUID.value) return fail(t('invoices.exclusion.contractRequired'));
  emit('submit', { contractUID: contractUID.value, note: note.value.trim() || null });
}
</script>

<template>
  <EuDialog :open="open" :title="t('invoices.exclusion.title')" @close="emit('close')">
    <form class="eu-form" @submit.prevent="submit">
      <EuEntityPicker
        :model-value="contractUID || null"
        :label="t('fields.contractUID')"
        required
        :options="contracts"
        @update:model-value="contractUID = $event ?? ''"
      />
      <EuTextField v-model="note" :label="t('invoices.exclusion.note')" />
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? t('common.saving') : t('invoices.exclusion.submit')
      }}</EuButton>
    </template>
  </EuDialog>
</template>
