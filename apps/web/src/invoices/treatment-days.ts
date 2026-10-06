/**
 * The treatment days of one invoice (Slice 41): the rules the two masks and the
 * two lists share, kept out of the components so they can be read and tested on
 * their own.
 *
 * The list is the *complete* one, not "the further days": `treatmentDate` is
 * its earliest entry, and the API keeps the two in step at every write (see
 * apps/api/src/domain/invoices.ts).
 */

import { formatDate, formatDayMonth } from '../lib/format';
import { i18n } from '../lib/i18n';
import type { InvoiceDto } from './api';

/**
 * The days as the API stores them: blanks dropped (an added but unfilled row is
 * not a day), no duplicates, earliest first. The same rule as `asDays()` on the
 * server, so what the mask shows after saving is what it sent.
 */
export function normalizeDays(days: string[]): string[] {
  return [...new Set(days.filter((day) => day !== ''))].sort();
}

/**
 * Whether all days fall in one calendar year — the rule the API enforces,
 * checked here so the dialog says it before the round trip. Deductible and
 * bonus are yearly figures keyed by the treatment year; an invoice across the
 * turn of the year is split into a second one.
 */
export function sameCalendarYear(days: string[]): boolean {
  return new Set(days.map((day) => day.slice(0, 4))).size <= 1;
}

/**
 * What the API answers when the days span two calendar years: the message of
 * its error code (lib/error-messages.ts), so the dialog and the round trip word
 * it the same way.
 */
export function differentYearsMessage(): string {
  return i18n.global.t('errors.code.TREATMENT_DAYS_DIFFERENT_YEARS');
}

/** The days besides the leading one — what the masks edit below "Behandlungsdatum". */
export function furtherDays(
  invoice: Pick<InvoiceDto, 'treatmentDate' | 'treatmentDates'>,
): string[] {
  return invoice.treatmentDates.filter((day) => day !== invoice.treatmentDate);
}

/**
 * How a set of treatment days reads in a list: the single day, or the span it
 * covers. Within one year the first day drops its year, which is the usual case
 * — an invoice never spans two of them. The span says nothing about the days in
 * between, so wherever it is shown the full list belongs in the title.
 */
export function treatmentDaysLabel(days: string[]): string {
  const sorted = normalizeDays(days);
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  if (from === undefined) return '–';
  if (from === to) return formatDate(from);
  if (!sameCalendarYear(sorted)) return `${formatDate(from)} – ${formatDate(to)}`;
  return `${formatDayMonth(from)}–${formatDate(to)}`;
}
