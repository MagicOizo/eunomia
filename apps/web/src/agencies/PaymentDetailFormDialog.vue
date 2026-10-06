<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { bic as bicText, iban } from '../lib/format';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import type { AgencyPaymentDetailDto, AgencyPaymentDetailInput } from './api';

/** Create/edit form for one set of an agency's payment details (Kontoverbindung). */
const props = defineProps<
  FormDialogProps & {
    /** The entry being edited, or null to add another set. */
    entry: AgencyPaymentDetailDto | null;
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: AgencyPaymentDetailInput] }>();
const { t } = useI18n();

const bankAccount = ref('');
const bic = ref('');
const recipientName = ref('');
const note = ref('');

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const entry = props.entry;
    // Shown grouped, as everywhere else; submit strips the spaces again.
    bankAccount.value = iban(entry?.bankAccount ?? '');
    bic.value = entry?.bic ?? '';
    recipientName.value = entry?.recipientName ?? '';
    note.value = entry?.note ?? '';
  },
  () => props.entry,
);

function submit(): void {
  clear();
  const compact = bankAccount.value.replace(/\s+/g, '').toUpperCase();
  if (compact === '') return fail(t('agencies.form.ibanRequired'));
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
    :title="entry ? t('agencies.editPaymentDetail') : t('agencies.addPaymentDetail')"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <!-- The explanations sit in the labels, as in the other forms of this
           kind: EuTextField has no hint of its own. -->
      <EuTextField v-model="bankAccount" :label="t('agencies.form.iban')" :normalize="iban" />
      <EuTextField v-model="bic" :label="t('agencies.form.bic')" :normalize="bicText" />
      <EuTextField v-model="recipientName" :label="t('agencies.form.recipient')" />
      <EuTextField v-model="note" :label="t('agencies.form.note')" />
      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>
    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting" @click="submit">{{
        submitting ? t('common.saving') : t('common.save')
      }}</EuButton>
    </template>
  </EuDialog>
</template>
