import assert from 'node:assert/strict';
import test from 'node:test';

import { bicField, ibanField, paymentDetailSchema } from './agency-payment-details.js';

/**
 * How an account number is read off a bill, and what the API stores for it.
 *
 * The check was there before; what is new is that it reads the number through
 * its written form first (issues.md 0.15.0-1). These cases hold that: the
 * grouping spaces and the case are notation, the rest is the value — and a
 * number that is wrong for real is still wrong, with the same sentence as
 * before.
 */

// --- IBAN --------------------------------------------------------------------

test('an IBAN copied off a bill keeps its grouping out of the stored value', () => {
  assert.equal(ibanField.parse('DE02 1203 0000 0000 2020 51'), 'DE02120300000000202051');
});

test('an IBAN typed in lower case is stored in capitals', () => {
  assert.equal(ibanField.parse('de02120300000000202051'), 'DE02120300000000202051');
});

test('tabs and surrounding whitespace go the same way as the grouping', () => {
  assert.equal(ibanField.parse('  de02\t1203 0000\n0000 2020 51 '), 'DE02120300000000202051');
});

test('an IBAN already compact and in capitals passes through untouched', () => {
  assert.equal(ibanField.parse('DE02120300000000202051'), 'DE02120300000000202051');
});

test('too short stays rejected — the spaces were the notation, not the number', () => {
  // 14 characters once the spaces are gone: the check wants at least 15.
  assert.throws(
    () => ibanField.parse('DE02 1203 0000 00'),
    (error: unknown) =>
      error instanceof Error && error.message.includes('Expected an IBAN-like account number'),
  );
});

test('a letter the charset does not allow stays rejected', () => {
  assert.throws(() => ibanField.parse('DE02-1203-0000-0000-2020-51'));
});

test('an IBAN that is not text at all is rejected, not coerced', () => {
  assert.throws(() => ibanField.parse(42));
  assert.throws(() => ibanField.parse(null));
});

// --- BIC ---------------------------------------------------------------------

test('a BIC is read the same way: spaces out, capitals in', () => {
  assert.equal(bicField.parse('coba deff xxx'), 'COBADEFFXXX');
});

test('a BIC of eight characters is as good as one of eleven', () => {
  assert.equal(bicField.parse('cobadeff'), 'COBADEFF');
});

test('nine characters stay rejected', () => {
  assert.throws(
    () => bicField.parse('COBADEFFX'),
    (error: unknown) =>
      error instanceof Error && error.message.includes('Expected a BIC of 8 or 11 characters'),
  );
});

/**
 * The optional BIC is the one place where normalising could have changed more
 * than the notation: a field that looks at its value before asking whether
 * there is one would turn "no BIC" into a validation error.
 */
test('an absent BIC is still absent, not an error', () => {
  assert.equal(bicField.nullish().parse(null), null);
  assert.equal(bicField.nullish().parse(undefined), undefined);
});

// --- The whole set -----------------------------------------------------------

test('a set of payment details is normalised field by field', () => {
  assert.deepEqual(
    paymentDetailSchema.parse({
      bankAccount: 'de89 3704 0044 0532 0130 00',
      bic: 'coba deff xxx',
      recipientName: '  Praxis Dr. Müller ',
      note: ' Hauptkonto ',
    }),
    {
      bankAccount: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      recipientName: 'Praxis Dr. Müller',
      note: 'Hauptkonto',
    },
  );
});
