/**
 * The ISO date text a date field speaks.
 *
 * Every date field in the app is a native `<input type="date">`, and those take
 * only ISO text. A `24.09.2026` copied out of Excel is dropped silently: the
 * browser fires the paste event, refuses the German notation and leaves the
 * field empty (measured in Chromium). So the fields catch the paste themselves
 * and hand the browser the ISO form instead — and where a form offers today as
 * its default, it takes that day from here too.
 */

/** Days per month, with February resolved by `isLeapYear`. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const length = month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
  return day <= length;
}

/**
 * Reads `DD.MM.YYYY` (and `D.M.YYYY`) as an ISO date, passing ISO text through
 * unchanged. Anything else — including a two-digit year — is `null` and left to
 * the browser: `15.03.57` would need the app to guess a century, and a birth
 * date is exactly where guessing goes wrong.
 */
export function isoFromGerman(text: string): string | null {
  const trimmed = text.trim();

  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (german) {
    const [, day, month, year] = german;
    if (!isRealDate(Number(year), Number(month), Number(day))) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, year, month, day] = iso;
    return isRealDate(Number(year), Number(month), Number(day)) ? trimmed : null;
  }

  return null;
}

/** The ISO date on the clipboard, or `null` to let the paste run as it would. */
export function pastedIsoDate(event: ClipboardEvent): string | null {
  const text = event.clipboardData?.getData('text');
  return text ? isoFromGerman(text) : null;
}

/**
 * `2026-09-24` plus `days` as `YYYY-MM-DD`, or `null` if the text is not a date
 * this module would accept. Counted in UTC on purpose, like `todayIso` reads
 * the local day on purpose: a calendar day plus fourteen calendar days has
 * nothing to do with clocks, and a local `Date` read back as ISO text drags the
 * zone into it — in Berlin, local midnight of `2026-10-25` is already
 * `2026-10-24` in UTC, and adding the days as milliseconds then lands a day
 * short because that night is 25 hours long.
 */
export function isoPlusDays(value: string, days: number): string | null {
  const iso = isoFromGerman(value);
  if (iso === null) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Today as `YYYY-MM-DD` in the reader's own zone — the calendar day they would
 * write on a form. Not `toISOString().slice(0, 10)`, which is the UTC day: in
 * Berlin that is still yesterday until 2 a.m., and the app would prefill a date
 * nobody meant.
 */
export function todayIso(): string {
  const now = new Date();
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
