/**
 * Number and date formats, for the text both sides write out.
 *
 * The API normally answers in English and the UI translates (error-codes.ts),
 * but two kinds of text leave the server already written: the payment reminder
 * mails and the labels the trash shows for a deleted record. They have to read
 * exactly like the same values in the web, so both use these.
 *
 * The format is a choice of its own, next to the language: English text with
 * German dates is a legitimate wish. It is named by a region tag rather than
 * the language, because British and American English write dates differently.
 *
 * Nothing here trusts its input: an empty or unusable value prints as a dash,
 * which is what a table wants to show, rather than "undefined.undefined.…" or
 * "NaN €".
 */

export const FORMAT_REGIONS = ['de-DE', 'en-GB', 'en-US'] as const;
export type FormatRegion = (typeof FORMAT_REGIONS)[number];

/** What an empty or unusable value prints as — an en dash, not a hyphen. */
const DASH = '–';

const moneyFormats = new Map<FormatRegion, Intl.NumberFormat>();
const dateFormats = new Map<FormatRegion, Intl.DateTimeFormat>();

function moneyFormat(region: FormatRegion): Intl.NumberFormat {
  let format = moneyFormats.get(region);
  if (!format) {
    format = new Intl.NumberFormat(region, { style: 'currency', currency: 'EUR' });
    moneyFormats.set(region, format);
  }
  return format;
}

/**
 * A calendar date carries no time, so it is formatted at UTC midnight in UTC:
 * no zone of the reader can move it to the day before.
 */
function dateFormat(region: FormatRegion): Intl.DateTimeFormat {
  let format = dateFormats.get(region);
  if (!format) {
    format = new Intl.DateTimeFormat(region, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    });
    dateFormats.set(region, format);
  }
  return format;
}

/** `45` → `45,00 €` (de-DE) or `€45.00` (en-*); anything that is not a number → `–`. */
export function formatMoney(value: unknown, region: FormatRegion): string {
  if (value === null || value === undefined || value === '') return DASH;
  const amount = Number(value);
  return Number.isFinite(amount) ? moneyFormat(region).format(amount) : DASH;
}

/** `2026-10-01` → `01.10.2026` (de-DE), `01/10/2026` (en-GB), `10/01/2026` (en-US). */
export function formatDate(value: unknown, region: FormatRegion): string {
  if (typeof value !== 'string') return DASH;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return DASH;
  const moment = new Date(`${value}T00:00:00Z`);
  // `2026-02-31` parses as a time value in some engines and rolls into March;
  // a date that does not survive the round trip is not a date.
  if (Number.isNaN(moment.getTime()) || moment.toISOString().slice(0, 10) !== value) return DASH;
  return dateFormat(region).format(moment);
}
