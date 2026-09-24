<script setup lang="ts">
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { ref, useId } from 'vue';

/**
 * A titled region that folds away. Used to keep a long settings page navigable
 * (Slice 30): every area is one heading, and what is not being edited is out of
 * the way.
 *
 * Not `<details>`/`<summary>`: the header carries a status slot next to the
 * title (a badge, a version), and browsers differ in how much of a `<summary>`
 * layout they allow. A button with `aria-expanded`/`aria-controls` is the same
 * pattern the policy dialog already uses for its histories (Slice 29) and gives
 * full control over the header.
 *
 * The open state is not persisted: two sections fit on a screen, and a
 * remembered fold would be one more thing to be wrong after a release.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    /** Collapsed on first render — sections start open unless asked otherwise. */
    initiallyCollapsed?: boolean;
  }>(),
  { initiallyCollapsed: false },
);

const open = ref(!props.initiallyCollapsed);
const regionId = useId();
const headingId = useId();
</script>

<template>
  <section class="eu-section" :aria-labelledby="headingId">
    <h2 class="eu-section__heading">
      <button
        type="button"
        class="eu-section__toggle"
        :aria-expanded="open"
        :aria-controls="regionId"
        @click="open = !open"
      >
        <FontAwesomeIcon
          :icon="faChevronDown"
          class="eu-section__chevron"
          :class="{ 'eu-section__chevron--open': open }"
          aria-hidden="true"
        />
        <span :id="headingId">{{ title }}</span>
      </button>
      <span class="eu-section__status"><slot name="status" /></span>
    </h2>
    <div v-show="open" :id="regionId" class="eu-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.eu-section {
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  background-color: var(--eu-color-surface-bg);
  /* No `overflow: hidden` to round off the children: the header button sits 1px
     inside this box and its focus ring is drawn 5px outside itself, so clipping
     here leaves a keyboard user with the ring's bottom edge and nothing else
     (measured). Nothing inside needs the clip — no child paints its own
     background into the corners. */
}

.eu-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0;
  padding: 0 1rem 0 0;
  font-size: 1.125rem;
}

.eu-section__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1 1 auto;
  /* The whole header line is the hit area, not just the words. */
  padding: 0.75rem 0.25rem 0.75rem 1rem;
  border: none;
  background: none;
  font: inherit;
  color: var(--eu-color-text);
  text-align: left;
  cursor: pointer;
}

.eu-section__chevron {
  font-size: 0.8em;
  color: var(--eu-color-text-muted);
  transition: transform 0.15s ease;
}

.eu-section__chevron--open {
  transform: rotate(180deg);
}

.eu-section__status {
  font-size: 0.875rem;
  font-weight: 400;
  font-family: var(--eu-font-data);
}

.eu-section__body {
  padding: 1.25rem 1rem;
  border-top: 1px solid var(--eu-color-border);
}

@media (prefers-reduced-motion: reduce) {
  .eu-section__chevron {
    transition: none;
  }
}
</style>
