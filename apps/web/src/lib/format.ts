/** Shared display formatters. */

/** Formats an optional money value as EUR (numbers arrive from the API as plain numbers). */
export function euro(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    Number(value),
  );
}

/** Formats an ISO date string (YYYY-MM-DD) as DD.MM.YYYY. */
export function germanDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '–';
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
