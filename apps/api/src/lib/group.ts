/**
 * Grouping rows in memory. It is the other half of every batched query in this
 * app: one question over many records, then the per-record lists a view needs
 * (CR-16, CR-17). Written out by hand four times before, which is four places
 * where the number of queries could start growing with the number of rows again.
 */

/** Appends a value to the list under `key`, starting the list when it is the first. */
export function addTo<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Groups rows under the key read from each of them. Both the keys and the rows
 * within a key keep the order they arrived in, so a query's `ORDER BY` still
 * decides how the lists read.
 */
export function groupBy<K, T>(rows: Iterable<T>, keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) addTo(map, keyOf(row), row);
  return map;
}
