import { formatDate as formatSharedDate, formatMoney as formatSharedMoney } from '@eunomia/shared';

import { activeFormat, i18n } from './i18n';

/**
 * Display formatters of the UI, in the format in effect (lib/i18n.ts).
 *
 * Amounts and dates are formatted the same way on both sides — the reminder
 * mails and the trash labels the API writes out have to read like the same
 * values in a table here — so those two come from @eunomia/shared and are
 * handed on from here, which keeps one door for the views.
 *
 * Every formatter reads the format when it is called, so a template or
 * computed that formats through one follows a change of language or format.
 */

/** What an empty or unusable value prints as — an en dash, not a hyphen. */
const DASH = '–';

/** `45` → `45,00 €` or `€45.00`; anything that is not a number → `–`. */
export function formatMoney(value: unknown): string {
  return formatSharedMoney(value, activeFormat());
}

/** An ISO date (`2026-10-01`) as `01.10.2026`, `01/10/2026` or `10/01/2026`. */
export function formatDate(value: unknown): string {
  return formatSharedDate(value, activeFormat());
}

/** Intl objects are not cheap to build; one per format and set of options is enough. */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const region = activeFormat();
  const key = `n|${region}|${JSON.stringify(options)}`;
  let format = cache.get(key) as Intl.NumberFormat | undefined;
  if (!format) {
    format = new Intl.NumberFormat(region, options);
    cache.set(key, format);
  }
  return format;
}

/** A plain number with up to `maxFractionDigits` decimals: `1,5` or `1.5`. */
export function formatNumber(value: number, maxFractionDigits = 2): string {
  return numberFormat({ maximumFractionDigits: maxFractionDigits }).format(value);
}

/** A percentage given as its number (`80` → `80 %` or `80%`). */
export function formatPercent(value: number): string {
  return numberFormat({ style: 'percent', maximumFractionDigits: 2 }).format(value / 100);
}

/** Whole euros, for a chart axis: `2.500 €` or `€2,500`. */
export function formatWholeMoney(value: number): string {
  return numberFormat({
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats a full ISO timestamp as date and time of day in local time — for the
 * moments the app records itself (e.g. the last mail send), where the time of
 * day is the point. Anything unparsable prints as a dash rather than
 * "Invalid Date".
 */
export function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || value === '') return DASH;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return DASH;
  const region = activeFormat();
  const key = `d|${region}`;
  let format = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!format) {
    format = new Intl.DateTimeFormat(region, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    cache.set(key, format);
  }
  return format.format(parsed);
}

/**
 * An ISO date without its year, `01.10.`, `01/10` or `10/01` — the first day
 * of a span whose last day carries the year. Each format has its own short form
 * (the German one keeps its trailing dot), so it is not cut from `formatDate`.
 */
export function formatDayMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return DASH;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return DASH;
  const region = activeFormat();
  const key = `dm|${region}`;
  let format = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!format) {
    format = new Intl.DateTimeFormat(region, { month: '2-digit', day: '2-digit', timeZone: 'UTC' });
    cache.set(key, format);
  }
  return format.format(parsed);
}

/**
 * The UI language, for what is a matter of language rather than format:
 * sorting and case folding.
 */
export function activeLanguage(): string {
  return i18n.global.locale.value;
}

/**
 * Counted noun with the matching German form: `plural(1, 'Rechnung',
 * 'Rechnungen')` → "1 Rechnung". The caller passes both forms in the case its
 * sentence needs ("von 1 leistungsfreien Jahr" vs "3 leistungsfreie Jahre"),
 * since German inflects the noun by case as well as by number.
 *
 * German only: it leaves with the texts of its callers, whose catalogue
 * messages count with vue-i18n's plural forms instead.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Groups an IBAN in fours (`DE89 3704 0044 0532 0130 00`) — the form it is
 * printed in, and the only one a picker list can break. Display only: stored,
 * submitted and QR-encoded, an IBAN stays compact (the API normalises it, and
 * the GiroCode spells it without spaces).
 */
export function iban(value: string): string {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return compact.match(/.{1,4}/g)?.join(' ') ?? '';
}

/**
 * The printed form of a BIC: no spaces, capitals. Unlike an IBAN it is not
 * grouped, so this is also exactly what is stored — it is here beside `iban`
 * because the two are typed into neighbouring fields and read off the same
 * line of the same bill.
 */
export function bic(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}
