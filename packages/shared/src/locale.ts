import { FORMAT_REGIONS, type FormatRegion } from './format.js';

/**
 * The languages Eunomia speaks. The web reads its texts from catalogues per
 * language (apps/web/src/locales); the API writes only its mails itself
 * (apps/api/src/mail/catalog.ts). Both validate a stored choice against this
 * list — a user's `locale` and the instance's `general.defaultLocale`.
 */
export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * How numbers and dates are written is a choice of its own, next to the
 * language: English text with German dates is a legitimate wish, and British
 * and American English disagree on the order of day and month. Without a
 * choice, the language decides.
 */
export const DEFAULT_FORMAT: Record<Locale, FormatRegion> = { de: 'de-DE', en: 'en-GB' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isFormatRegion(value: unknown): value is FormatRegion {
  return typeof value === 'string' && (FORMAT_REGIONS as readonly string[]).includes(value);
}
