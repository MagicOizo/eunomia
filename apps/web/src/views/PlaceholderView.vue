<script setup lang="ts">
import { faPersonDigging } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
</script>

<template>
  <div class="eu-placeholder">
    <FontAwesomeIcon :icon="faPersonDigging" class="eu-placeholder__icon" aria-hidden="true" />
    <p>
      Dieser Bereich ist bereits in der Navigation verankert, die eigentliche Seite entsteht in
      einem der nächsten Slices. Die API dahinter steht schon bereit.
    </p>
  </div>
</template>

<style scoped>
.eu-placeholder {
  max-width: 32rem;
  margin: 3rem auto;
  text-align: center;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-placeholder__icon {
  font-size: 2.5rem;
  color: var(--eu-color-accent-soft);
  margin-bottom: 1rem;
}
</style>
