<script setup lang="ts">
// Minimal centered layout for pages shown without the app shell (e.g. login).
</script>

<template>
  <div class="eu-blank">
    <slot />
  </div>
</template>

<style scoped>
.eu-blank {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 1.5rem;
  background-color: var(--eu-color-page-bg);
}
</style>
