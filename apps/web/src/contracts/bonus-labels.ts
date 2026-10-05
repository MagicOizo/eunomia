import { germanMoney } from '../lib/format';
import type { BonusYearDto } from './api';

const factorFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** A bonus factor in the insurer's words: "1 Monatsbeitrag", "1,5 Monatsbeiträge". */
export function factorLabel(factor: number): string {
  return `${factorFormat.format(factor)} ${factor === 1 ? 'Monatsbeitrag' : 'Monatsbeiträge'}`;
}

/**
 * A bonus factor where the full wording does not fit, "1,5-fach": the terms
 * table has the width of an amount per step, not of "1,5 Monatsbeiträge".
 */
export function factorShort(factor: number): string {
  return `${factorFormat.format(factor)}-fach`;
}

/**
 * How a factor forecast came about, "1,5 × Ø 410,00 €"; null for an amount
 * tier or when the average is unknown.
 */
export function forecastBasis(
  year: Pick<BonusYearDto, 'bonusFactor' | 'relevantPremiumAverage'>,
): string | null {
  if (year.bonusFactor === null || year.relevantPremiumAverage === null) return null;
  return `${factorFormat.format(year.bonusFactor)} × Ø ${germanMoney(year.relevantPremiumAverage)}`;
}
