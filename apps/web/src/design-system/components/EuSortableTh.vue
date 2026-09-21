<script setup lang="ts">
import { faSortDown, faSortUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';

import type { SortState } from '../../lib/useTableSort';

/**
 * A sortable table-header cell. Renders a `<th>` (so it drops straight into a
 * `<tr>`) with a clickable button that cycles the column's sort. An arrow is
 * shown only while the column is actively sorted — ascending (faSortUp) or
 * descending (faSortDown); the default (unsorted) state shows no icon.
 * Reports the current state to assistive tech via `aria-sort`.
 */
const props = defineProps<{ label: string; state: SortState; align?: 'left' | 'center' | 'right' }>();
const emit = defineEmits<{ sort: [] }>();

const icon = computed(() => (props.state === 'asc' ? faSortUp : faSortDown));
const ariaSort = computed(() =>
  props.state === 'asc' ? 'ascending' : props.state === 'desc' ? 'descending' : 'none',
);
</script>

<template>
  <th :aria-sort="ariaSort" :style="align ? { textAlign: align } : undefined">
    <button type="button" class="eu-sort" @click="emit('sort')">
      <span>{{ label }}</span>
      <FontAwesomeIcon v-if="state !== 'none'" :icon="icon" class="eu-sort__icon" aria-hidden="true" />
    </button>
  </th>
</template>

<style scoped>
.eu-sort {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  /* Inherit the header's own typography so the button reads as a plain <th>.
     `font` shorthand omits transform/spacing, so inherit those explicitly. */
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  text-align: inherit;
}

.eu-sort__icon {
  color: var(--eu-color-accent-text);
  font-size: 0.85em;
}

.eu-sort:focus-visible {
  outline: 2px solid var(--eu-color-focus-ring);
  outline-offset: 2px;
  border-radius: 0.25rem;
}
</style>
