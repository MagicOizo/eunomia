<script setup lang="ts">
/**
 * The three-column display mask of dialog-design.md: Label | value | actions.
 * Holds the grid that `EuDetailField` rows dissolve into (they use
 * `display: contents`), so every mask — invoice, policy, master data — lines up
 * the same way. Rows go in the default slot.
 */
</script>

<template>
  <div class="eu-detail-mask">
    <slot />
  </div>
</template>

<style scoped>
.eu-detail-mask {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 1rem;
  /* Compact on purpose: this reads as a display mask, not as a form. */
  row-gap: 0.35rem;
  font-family: var(--eu-font-data);
}
</style>
