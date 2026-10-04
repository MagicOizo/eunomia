/**
 * Display formatters of the UI.
 *
 * Amounts and dates are formatted the same way on both sides — the reminder
 * mails and the trash labels the API writes out have to read like the same
 * values in a table here — so those two live in @eunomia/shared and are handed
 * on from here, which keeps one door for the views.
 */

export { germanDate, germanMoney } from '@eunomia/shared';

/**
 * Counted noun with the matching German form: `plural(1, 'Rechnung',
 * 'Rechnungen')` → "1 Rechnung". The caller passes both forms in the case its
 * sentence needs ("von 1 leistungsfreien Jahr" vs "3 leistungsfreie Jahre"),
 * since German inflects the noun by case as well as by number.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Formats a full ISO timestamp as DD.MM.YYYY, HH:MM in local time — for the
 * moments the app records itself (e.g. the last mail send), where the time of
 * day is the point. Anything unparsable prints as a dash rather than
 * "Invalid Date".
 */
export function germanDateTime(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '–';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '–';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return (
    `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}.${parsed.getFullYear()}, ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
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
