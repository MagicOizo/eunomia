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
