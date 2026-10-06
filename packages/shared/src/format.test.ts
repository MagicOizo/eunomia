import assert from 'node:assert/strict';
import test from 'node:test';

import { FORMAT_REGIONS, formatDate, formatMoney, germanDate, germanMoney } from './format.js';

/** The separator Intl puts between amount and sign is a non-breaking space. */
const NBSP = '\u00a0';

test('money is written the German way, with the sign behind the amount', () => {
  assert.equal(germanMoney(45), `45,00${NBSP}€`);
  assert.equal(germanMoney(0), `0,00${NBSP}€`);
  assert.equal(germanMoney(-1234.5), `-1.234,50${NBSP}€`);
  // The API hands amounts out as strings where the driver does (DECIMAL).
  assert.equal(germanMoney('120.00'), `120,00${NBSP}€`);
});

test('English formats put the euro sign in front and swap the separators', () => {
  assert.equal(formatMoney(-1234.5, 'en-GB'), '-€1,234.50');
  assert.equal(formatMoney('120.00', 'en-US'), '€120.00');
});

test('a German date is turned around, not shifted', () => {
  assert.equal(germanDate('2026-10-01'), '01.10.2026');
  assert.equal(germanDate('1978-01-09'), '09.01.1978');
});

test('British dates put the day first, American dates the month', () => {
  assert.equal(formatDate('2026-10-01', 'en-GB'), '01/10/2026');
  assert.equal(formatDate('2026-10-01', 'en-US'), '10/01/2026');
});

test('nothing unusable is printed as if it were a value', () => {
  // This is the whole point of sharing these: the API's own version had no
  // such check and wrote 'undefined.undefined.undefined' into a trash label.
  for (const region of FORMAT_REGIONS) {
    for (const value of ['', null, undefined, 'irgendwas', 42, '2026-10', '2026-02-31']) {
      assert.equal(formatDate(value, region), '–', `${region} ${JSON.stringify(value)}`);
    }
    for (const value of ['', null, undefined, 'irgendwas', Number.NaN, Infinity]) {
      assert.equal(formatMoney(value, region), '–', `${region} ${JSON.stringify(value)}`);
    }
  }
});
