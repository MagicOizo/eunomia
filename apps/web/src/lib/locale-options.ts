import {
  FORMAT_REGIONS,
  type FormatRegion,
  type Locale,
  SUPPORTED_LOCALES,
  formatDate,
  formatMoney,
} from '@eunomia/shared';

import { i18n } from './i18n';

/**
 * The entries of the language and format selects in the profile and the
 * system settings (Slice 83).
 */

const { t } = i18n.global;

/**
 * A language named in itself — "Deutsch", "English" — as language menus do:
 * whoever cannot read the current interface still finds their own. The
 * browser knows the names, so a new language needs no catalogue entry here.
 */
export function languageName(locale: Locale): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
}

const FORMAT_NAMES: Record<FormatRegion, () => string> = {
  'de-DE': () => t('localeChoice.formats.german'),
  'en-GB': () => t('localeChoice.formats.british'),
  'en-US': () => t('localeChoice.formats.american'),
};

/** The last day of the year shows whether the day or the month comes first. */
const SAMPLE_DATE = '2026-12-31';
const SAMPLE_AMOUNT = 1234.56;

/** A format by its name and what it does to a date and an amount. */
export function formatName(region: FormatRegion): string {
  return t('localeChoice.formatOption', {
    name: FORMAT_NAMES[region](),
    date: formatDate(SAMPLE_DATE, region),
    amount: formatMoney(SAMPLE_AMOUNT, region),
  });
}

export function languageOptions(): Array<{ value: Locale; label: string }> {
  return SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: languageName(locale) }));
}

export function formatOptions(): Array<{ value: FormatRegion; label: string }> {
  return FORMAT_REGIONS.map((region) => ({ value: region, label: formatName(region) }));
}
