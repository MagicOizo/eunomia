<script setup lang="ts">
import { useId } from 'vue';

/** A slider-style boolean toggle (nicer than a bare checkbox for on/off flags). */
defineProps<{ modelValue: boolean; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const inputId = useId();
</script>

<template>
  <label :for="inputId" class="eu-toggle">
    <input
      :id="inputId"
      type="checkbox"
      class="eu-toggle__input"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="eu-toggle__track" aria-hidden="true"><span class="eu-toggle__thumb" /></span>
    <span class="eu-toggle__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.eu-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--eu-font-data);
  cursor: pointer;
}

/* Visually hidden but still focusable/announced. */
.eu-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.eu-toggle__track {
  position: relative;
  display: inline-block;
  width: 2.4rem;
  height: 1.35rem;
  border-radius: 999px;
  background-color: var(--eu-color-border);
  transition: background-color 0.15s ease;
  flex-shrink: 0;
}

.eu-toggle__thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 50%;
  background-color: var(--eu-color-surface-bg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 35%);
  transition: transform 0.15s ease;
}

.eu-toggle__input:checked + .eu-toggle__track {
  background-color: var(--eu-color-accent);
}

.eu-toggle__input:checked + .eu-toggle__track .eu-toggle__thumb {
  transform: translateX(1.05rem);
}

.eu-toggle__input:focus-visible + .eu-toggle__track {
  outline: 3px solid var(--eu-color-focus-ring);
  outline-offset: 2px;
}
</style>
