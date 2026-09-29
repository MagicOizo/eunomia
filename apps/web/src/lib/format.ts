/** Shared display formatters. */

/** Formats an optional money value as EUR (numbers arrive from the API as plain numbers). */
export function euro(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Number(value),
  );
}

/**
 * Counted noun with the matching German form: `plural(1, 'Rechnung',
 * 'Rechnungen')` → "1 Rechnung". The caller passes both forms in the case its
 * sentence needs ("von 1 leistungsfreien Jahr" vs "3 leistungsfreie Jahre"),
 * since German inflects the noun by case as well as by number.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Formats an ISO date string (YYYY-MM-DD) as DD.MM.YYYY. */
export function germanDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '–';
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
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
