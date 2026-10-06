import { describe, expect, it } from 'vitest';

import { withLocale } from '../test/locale';
import { factorLabel, factorShort, forecastBasis } from './bonus-labels';

describe('bonus labels', () => {
  it('name a factor in German, one premium against a fraction of several', () => {
    expect(factorLabel(1)).toBe('1 Monatsbeitrag');
    expect(factorLabel(1.5)).toBe('1,5 Monatsbeiträge');
    expect(factorShort(2.5)).toBe('2,5-fach');
  });

  it('name a factor in English', async () => {
    await withLocale('en', () => {
      expect(factorLabel(1)).toBe('1 monthly premium');
      expect(factorLabel(1.5)).toBe('1.5 monthly premiums');
      expect(factorShort(2.5)).toBe('2.5×');
    });
  });

  it('give the basis of a factor forecast only when there is one', async () => {
    expect(forecastBasis({ bonusFactor: 1.5, relevantPremiumAverage: 410 })).toMatch(
      /^1,5 × Ø 410,00\s€$/,
    );
    expect(forecastBasis({ bonusFactor: null, relevantPremiumAverage: 410 })).toBeNull();
    expect(forecastBasis({ bonusFactor: 1.5, relevantPremiumAverage: null })).toBeNull();
    await withLocale('en', () => {
      expect(forecastBasis({ bonusFactor: 1.5, relevantPremiumAverage: 410 })).toBe(
        '1.5 × avg. €410.00',
      );
    });
  });
});
