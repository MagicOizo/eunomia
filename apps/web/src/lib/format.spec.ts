import { describe, expect, it } from 'vitest';

import { plural } from './format';

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
