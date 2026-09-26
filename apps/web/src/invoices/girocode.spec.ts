import { describe, expect, it } from 'vitest';

import { buildGirocode } from './girocode';

const base = {
  recipient: 'Beispiel Inkasso GmbH',
  iban: 'DE02120300000000202051',
  amount: 320,
  subject: 'RG-2026-0042',
};

/** The payload of a successful build, or a failing assertion. */
function payloadOf(result: ReturnType<typeof buildGirocode>): string {
  if (!result.ok) throw new Error(`expected a payload, got: ${result.reason}`);
  return result.payload;
}

describe('buildGirocode', () => {
  it('assembles the eleven EPC069-12 lines in order', () => {
    expect(payloadOf(buildGirocode(base)).split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      '',
      'Beispiel Inkasso GmbH',
      'DE02120300000000202051',
      'EUR320.00',
      '',
      '',
      'RG-2026-0042',
    ]);
  });

  it('formats the amount the scheme way, not the German way', () => {
    expect(payloadOf(buildGirocode({ ...base, amount: 1234.5 }))).toContain('EUR1234.50');
    expect(payloadOf(buildGirocode({ ...base, amount: 0.01 }))).toContain('EUR0.01');
  });

  it('normalises the IBAN to uppercase without spaces', () => {
    const payload = payloadOf(buildGirocode({ ...base, iban: 'de02 1203 0000 0000 2020 51' }));
    expect(payload.split('\n')[6]).toBe('DE02120300000000202051');
  });

  it('carries the BIC in line 5 and normalises it', () => {
    expect(payloadOf(buildGirocode({ ...base, bic: 'COBADEFFXXX' })).split('\n')[4]).toBe(
      'COBADEFFXXX',
    );
    expect(payloadOf(buildGirocode({ ...base, bic: 'byladem1 001' })).split('\n')[4]).toBe(
      'BYLADEM1001',
    );
  });

  it('leaves the BIC line empty when the account has none — version 002 allows that', () => {
    for (const bic of [undefined, null, '  ']) {
      expect(payloadOf(buildGirocode({ ...base, bic })).split('\n')[4]).toBe('');
    }
  });

  it('leaves the reference line empty when there is no Verwendungszweck', () => {
    expect(payloadOf(buildGirocode({ ...base, subject: null })).split('\n')[10]).toBe('');
  });

  it('truncates the beneficiary name to 70 characters', () => {
    const payload = payloadOf(buildGirocode({ ...base, recipient: 'A'.repeat(90) }));
    expect(payload.split('\n')[5]).toBe('A'.repeat(70));
  });

  it('truncates the remittance information to 140 characters', () => {
    const payload = payloadOf(buildGirocode({ ...base, subject: 'B'.repeat(200) }));
    expect(payload.split('\n')[10]).toBe('B'.repeat(140));
  });

  it('refuses a missing IBAN', () => {
    const result = buildGirocode({ ...base, iban: '   ' });
    expect(result).toEqual({ ok: false, reason: 'Für diese Rechnung ist keine IBAN hinterlegt.' });
  });

  it('refuses a missing recipient', () => {
    const result = buildGirocode({ ...base, recipient: '' });
    expect(result.ok).toBe(false);
  });

  it.each([0, -5, 1_000_000_000, Number.NaN])('refuses the amount %p', (amount) => {
    const result = buildGirocode({ ...base, amount });
    expect(result).toEqual({
      ok: false,
      reason: 'Der Rechnungsbetrag lässt sich nicht als GiroCode darstellen.',
    });
  });

  it('measures the payload budget in UTF-8 bytes, so umlauts count double', () => {
    // 70 + 140 characters fit the fields, but as two-byte umlauts they blow the
    // 331-byte payload budget — the case a character count would miss.
    const result = buildGirocode({
      ...base,
      recipient: 'Ü'.repeat(70),
      subject: 'Ä'.repeat(140),
    });
    expect(result).toEqual({
      ok: false,
      reason: 'Die Zahlungsdaten sind für einen GiroCode zu lang.',
    });

    const ascii = buildGirocode({ ...base, recipient: 'A'.repeat(70), subject: 'B'.repeat(140) });
    expect(ascii.ok).toBe(true);
  });
});
