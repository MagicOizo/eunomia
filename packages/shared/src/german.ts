/**
 * German number and date formats, for the text both sides write out.
 *
 * The API normally answers in English and the UI translates (error-codes.ts),
 * but two kinds of text leave the server already written: the payment reminder
 * mails and the labels the trash shows for a deleted record. They have to read
 * exactly like the same values in the web, so both use these.
 *
 * Nothing here trusts its input: an empty or unusable value prints as a dash,
 * which is what a table wants to show, rather than "undefined.undefined.…" or
 * "NaN €".
 */

/** What an empty or unusable value prints as — an en dash, not a hyphen. */
const DASH = '–';

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** `45` → `45,00 €`; anything that is not a number → `–`. */
export function germanMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const amount = Number(value);
  return Number.isFinite(amount) ? money.format(amount) : DASH;
}

/** `2026-10-01` → `01.10.2026`, without pulling the reader's locale into it. */
export function germanDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return DASH;
  const [year, month, day] = value.split('-');
  if (year === undefined || month === undefined || day === undefined) return DASH;
  return `${day}.${month}.${year}`;
}
