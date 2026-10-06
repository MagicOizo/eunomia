<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';

export interface SelectOption {
  value: string;
  label: string;
}

defineProps<{
  modelValue: string;
  label: string;
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
  /**
   * What the empty entry says where "nothing chosen" is not "none": a filter
   * that is not set means every row, not a row without a value (Slice 45).
   */
  emptyLabel?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();

const selectId = useId();
</script>

<template>
  <div class="eu-select-field">
    <label :for="selectId" class="eu-select-field__label">{{ label }}</label>
    <select
      :id="selectId"
      class="eu-select-field__input"
      :value="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">
        {{ emptyLabel ?? (required ? t('common.pleaseChoose') : t('common.none')) }}
      </option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.eu-select-field {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
  font-family: var(--eu-font-data);
}

.eu-select-field__label {
  font-weight: 600;
  color: var(--eu-color-text);
}

.eu-select-field__input {
  font: inherit;
  padding: 0.5em 0.75em;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375em;
  background-color: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
}

.eu-select-field__input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
