import { describe, expect, it } from 'vitest';

import { withFormat, withLocale } from '../test/locale';
import {
  bic,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatWholeMoney,
  iban,
  plural,
} from './format';

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'Rechnung', 'Rechnungen')).toBe('1 Rechnung');
  });

  it('uses the plural for everything else, zero included', () => {
    expect(plural(0, 'Rechnung', 'Rechnungen')).toBe('0 Rechnungen');
    expect(plural(3, 'Rechnung', 'Rechnungen')).toBe('3 Rechnungen');
  });

  it('leaves the grammatical case to the caller', () => {
    // German inflects by case as well: the same count reads differently in
    // "Serie: 1 leistungsfreies Jahr" and "Serie von 1 leistungsfreien Jahr".
    expect(plural(1, 'leistungsfreies Jahr', 'leistungsfreie Jahre')).toBe(
      '1 leistungsfreies Jahr',
    );
    expect(plural(1, 'leistungsfreien Jahr', 'leistungsfreien Jahren')).toBe(
      '1 leistungsfreien Jahr',
    );
  });
});

describe('formatDateTime', () => {
  it('formats a timestamp as date and time of day', () => {
    // Built from local parts, so the expectation holds in any timezone the
    // suite runs in (CI is UTC, the author is not).
    const local = new Date(2026, 8, 24, 8, 5).toISOString();
    expect(formatDateTime(local)).toBe('24.09.2026, 08:05');
  });

  it('prints a dash instead of "Invalid Date" for anything unusable', () => {
    for (const value of ['', 'irgendwas', null, undefined, 42]) {
      expect(formatDateTime(value)).toBe('–');
    }
  });
});

describe('the format in effect', () => {
  it('is German by default', () => {
    expect(formatDate('2026-10-01')).toBe('01.10.2026');
    expect(formatMoney(1234.5)).toBe('1.234,50\u00a0€');
    expect(formatNumber(1.5)).toBe('1,5');
    expect(formatWholeMoney(2500)).toBe('2.500\u00a0€');
  });

  it('follows the language when no format is chosen: English is British', async () => {
    await withLocale('en', () => {
      expect(formatDate('2026-10-01')).toBe('01/10/2026');
      expect(formatMoney(1234.5)).toBe('€1,234.50');
      expect(formatNumber(1.5)).toBe('1.5');
      expect(formatPercent(80)).toBe('80%');
    });
  });

  it('can be chosen apart from the language — German text, American dates', async () => {
    await withFormat('en-US', () => {
      expect(formatDate('2026-10-01')).toBe('10/01/2026');
      expect(formatWholeMoney(2500)).toBe('€2,500');
    });
    expect(formatDate('2026-10-01')).toBe('01.10.2026');
  });
});

describe('bic', () => {
  it('takes the spaces out and upper-cases — a BIC is not grouped', () => {
    expect(bic('coba deff xxx')).toBe('COBADEFFXXX');
  });

  it('leaves one already written that way alone', () => {
    expect(bic('COBADEFF')).toBe('COBADEFF');
  });

  it('leaves nothing standing for an empty value', () => {
    expect(bic('')).toBe('');
  });
});

describe('iban', () => {
  it('groups in fours, the form an IBAN is printed in', () => {
    expect(iban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });

  it('regroups what already carries spaces, and upper-cases', () => {
    expect(iban('de89 3704 00440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });

  it('leaves nothing standing for an empty value', () => {
    expect(iban('')).toBe('');
  });
});
