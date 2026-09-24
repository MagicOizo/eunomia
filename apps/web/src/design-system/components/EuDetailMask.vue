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

/*
 * Narrow screens: the label column claims `max-content`, which on a phone
 * leaves ~60px for the value and cuts every one of them off. Below this width
 * the label moves onto its own line above the value; the actions stay on the
 * value's line. The counterpart rules (label spanning, spacing) live in
 * EuDetailField, next to the elements they style. The dialog is viewport-wide
 * below 46rem, so the viewport width stands in for the dialog width here.
 */
@media (max-width: 34rem) {
  .eu-detail-mask {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0;
  }
}
</style>
