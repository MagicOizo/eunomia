import assert from 'node:assert/strict';
import test from 'node:test';

import { germanDate, germanMoney } from './german.js';

/** The separator Intl puts between amount and sign is a non-breaking space. */
const NBSP = ' ';

test('money is written the German way, with the sign behind the amount', () => {
  assert.equal(germanMoney(45), `45,00${NBSP}€`);
  assert.equal(germanMoney(0), `0,00${NBSP}€`);
  assert.equal(germanMoney(-1234.5), `-1.234,50${NBSP}€`);
  // The API hands amounts out as strings where the driver does (DECIMAL).
  assert.equal(germanMoney('120.00'), `120,00${NBSP}€`);
});

test('a date is turned around, not localised', () => {
  assert.equal(germanDate('2026-10-01'), '01.10.2026');
  assert.equal(germanDate('1978-01-09'), '09.01.1978');
});

test('nothing unusable is printed as if it were a value', () => {
  // This is the whole point of sharing these two: the API's own version had no
  // such check and wrote 'undefined.undefined.undefined' into a trash label.
  for (const value of ['', null, undefined, 'irgendwas', 42]) {
    assert.equal(germanDate(value), '–', JSON.stringify(value));
  }
  for (const value of ['', null, undefined, 'irgendwas', Number.NaN, Infinity]) {
    assert.equal(germanMoney(value), '–', JSON.stringify(value));
  }
});
