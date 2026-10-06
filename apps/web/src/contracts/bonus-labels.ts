import { formatMoney, formatNumber } from '../lib/format';
import { i18n } from '../lib/i18n';
import type { BonusYearDto } from './api';

const { t } = i18n.global;

/**
 * A bonus factor in the insurer's words: "1 Monatsbeitrag", "1,5 Monatsbeiträge".
 * The count picks the form, the shown number is the formatted one ("1,5").
 */
export function factorLabel(factor: number): string {
  return t('contracts.bonus.factor', { n: formatNumber(factor) }, factor);
}

/**
 * A bonus factor where the full wording does not fit, "1,5-fach": the terms
 * table has the width of an amount per step, not of "1,5 Monatsbeiträge".
 */
export function factorShort(factor: number): string {
  return t('contracts.bonus.factorShort', { n: formatNumber(factor) });
}

/**
 * How a factor forecast came about, "1,5 × Ø 410,00 €"; null for an amount
 * tier or when the average is unknown.
 */
export function forecastBasis(
  year: Pick<BonusYearDto, 'bonusFactor' | 'relevantPremiumAverage'>,
): string | null {
  if (year.bonusFactor === null || year.relevantPremiumAverage === null) return null;
  return t('contracts.bonus.basis', {
    factor: formatNumber(year.bonusFactor),
    amount: formatMoney(year.relevantPremiumAverage),
  });
}
