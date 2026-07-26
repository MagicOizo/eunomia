import { computed, reactive, type Ref, ref } from 'vue';

export type SortDirection = 'default' | 'asc' | 'desc';
export type SortState = 'asc' | 'desc' | 'none';

type Comparable = string | number | boolean | null | undefined;

/** Locale-aware comparator: numbers numerically, everything else as German text. */
function compareValues(a: Comparable, b: Comparable): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls / empty values sort last
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de', { numeric: true, sensitivity: 'base' });
}

/**
 * Click-to-sort state for a table header: cycles a column through
 * default → asc → desc → default, one column at a time. `getValue` maps a row
 * and column key to the value to sort by, so callers can sort by an underlying
 * value (ISO date, looked-up name) rather than the rendered display text.
 * "default" preserves the original (load) order; sorting never mutates `rows`.
 */
export function useTableSort<T>(rows: Ref<T[]>, getValue: (row: T, key: string) => Comparable) {
  const sortKey = ref<string | null>(null);
  const direction = ref<SortDirection>('default');

  function toggle(key: string): void {
    if (sortKey.value !== key) {
      sortKey.value = key;
      direction.value = 'asc';
    } else if (direction.value === 'asc') {
      direction.value = 'desc';
    } else if (direction.value === 'desc') {
      sortKey.value = null;
      direction.value = 'default';
    } else {
      direction.value = 'asc';
    }
  }

  function stateOf(key: string): SortState {
    return sortKey.value === key && direction.value !== 'default' ? direction.value : 'none';
  }

  const sorted = computed<T[]>(() => {
    const key = sortKey.value;
    if (key === null || direction.value === 'default') return rows.value;
    const factor = direction.value === 'asc' ? 1 : -1;
    // Copy first — Array.prototype.sort is in-place and stable, so ties keep
    // their original order and the source array stays untouched.
    return [...rows.value].sort((a, b) => factor * compareValues(getValue(a, key), getValue(b, key)));
  });

  // reactive() so consumers can read `sort.sorted` / `sort.stateOf(...)` in a
  // template with the nested refs auto-unwrapped (a plain object would not).
  return reactive({ sortKey, direction, toggle, stateOf, sorted });
}
