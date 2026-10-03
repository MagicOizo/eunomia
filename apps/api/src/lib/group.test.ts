import assert from 'node:assert/strict';
import test from 'node:test';

import { addTo, groupBy } from './group.js';

test('the first value starts the list, the next ones follow it', () => {
  const map = new Map<string, number[]>();
  addTo(map, 'a', 1);
  addTo(map, 'a', 2);
  addTo(map, 'b', 3);
  assert.deepEqual(
    [...map],
    [
      ['a', [1, 2]],
      ['b', [3]],
    ],
  );
});

test('grouping keeps the order of the keys and of the rows within them', () => {
  const rows = [
    { uid: 'i-2', n: 1 },
    { uid: 'i-1', n: 2 },
    { uid: 'i-2', n: 3 },
  ];
  const grouped = groupBy(rows, (row) => row.uid);
  assert.deepEqual([...grouped.keys()], ['i-2', 'i-1']);
  assert.deepEqual(
    grouped.get('i-2')?.map((row) => row.n),
    [1, 3],
  );
  assert.deepEqual(grouped.get('i-3'), undefined);
});

test('a composed key buckets by more than one column', () => {
  const rows = [
    { invoiceUID: 'i-1', contractUID: 'c-1' },
    { invoiceUID: 'i-1', contractUID: 'c-2' },
    { invoiceUID: 'i-1', contractUID: 'c-1' },
  ];
  const grouped = groupBy(rows, (row) => `${row.invoiceUID}\u0000${row.contractUID}`);
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get('i-1\u0000c-1')?.length, 2);
});
