<script setup lang="ts">
import { faPersonDigging } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => route.meta.title ?? 'Bereich');
</script>

<template>
  <div class="eu-placeholder">
    <FontAwesomeIcon :icon="faPersonDigging" class="eu-placeholder__icon" aria-hidden="true" />
    <h2>{{ title }}</h2>
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

.eu-placeholder h2 {
  color: var(--eu-color-text);
  margin: 0 0 0.5rem;
}
</style>
