import { formatMoney, formatNumber } from '../lib/format';
import type { BonusYearDto } from './api';

/** A bonus factor in the insurer's words: "1 Monatsbeitrag", "1,5 Monatsbeiträge". */
export function factorLabel(factor: number): string {
  return `${formatNumber(factor)} ${factor === 1 ? 'Monatsbeitrag' : 'Monatsbeiträge'}`;
}

/**
 * A bonus factor where the full wording does not fit, "1,5-fach": the terms
 * table has the width of an amount per step, not of "1,5 Monatsbeiträge".
 */
export function factorShort(factor: number): string {
  return `${formatNumber(factor)}-fach`;
}

/**
 * How a factor forecast came about, "1,5 × Ø 410,00 €"; null for an amount
 * tier or when the average is unknown.
 */
export function forecastBasis(
  year: Pick<BonusYearDto, 'bonusFactor' | 'relevantPremiumAverage'>,
): string | null {
  if (year.bonusFactor === null || year.relevantPremiumAverage === null) return null;
  return `${formatNumber(year.bonusFactor)} × Ø ${formatMoney(year.relevantPremiumAverage)}`;
}
