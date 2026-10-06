import { describe, expect, it } from 'vitest';

import { isoFromDateText, isoPlusDays } from './date-input';

describe('isoFromDateText', () => {
  it('reads the German notation a spreadsheet puts on the clipboard', () => {
    expect(isoFromDateText('24.09.2026')).toBe('2026-09-24');
    expect(isoFromDateText('4.9.2026')).toBe('2026-09-04');
    expect(isoFromDateText('  24.09.2026  ')).toBe('2026-09-24');
  });

  it('passes ISO text through, so a copy out of the app itself still works', () => {
    expect(isoFromDateText('2026-09-24')).toBe('2026-09-24');
  });

  it('refuses a two-digit year instead of guessing a century', () => {
    // 15.03.57 is a birth date in 1957 to a human and 2057 to a naive parser.
    expect(isoFromDateText('24.09.26')).toBeNull();
    expect(isoFromDateText('15.03.57')).toBeNull();
  });

  it('refuses a day the month does not have', () => {
    expect(isoFromDateText('31.02.2026')).toBeNull();
    expect(isoFromDateText('29.02.2026')).toBeNull();
    expect(isoFromDateText('29.02.2024')).toBe('2024-02-29'); // leap year
    expect(isoFromDateText('31.04.2026')).toBeNull();
    expect(isoFromDateText('00.09.2026')).toBeNull();
    expect(isoFromDateText('24.13.2026')).toBeNull();
    expect(isoFromDateText('2026-02-31')).toBeNull();
  });

  it('leaves anything else to the browser', () => {
    for (const text of ['', '   ', 'morgen', '24/09/2026', '24.09.2026 08:15', '20260924']) {
      expect(isoFromDateText(text)).toBeNull();
    }
  });

  it('reads slashes by the format in effect: day first in Britain, month first in the US', () => {
    expect(isoFromDateText('01/10/2026', 'en-GB')).toBe('2026-10-01');
    expect(isoFromDateText('1/10/2026', 'en-US')).toBe('2026-01-10');
    expect(isoFromDateText('24/09/2026', 'en-US')).toBeNull(); // no 24th month
    expect(isoFromDateText('09/31/2026', 'en-US')).toBeNull(); // no 31 September
  });

  it('keeps the dotted notation day first in every format', () => {
    expect(isoFromDateText('01.10.2026', 'en-US')).toBe('2026-10-01');
    expect(isoFromDateText('01.10.2026', 'en-GB')).toBe('2026-10-01');
  });
});

describe('isoPlusDays', () => {
  it('counts calendar days on from a date', () => {
    expect(isoPlusDays('2020-03-01', 14)).toBe('2020-03-15');
    expect(isoPlusDays('2020-03-01', 0)).toBe('2020-03-01');
  });

  it('carries over the end of a month and of a year', () => {
    expect(isoPlusDays('2026-09-24', 30)).toBe('2026-10-24');
    expect(isoPlusDays('2026-12-20', 15)).toBe('2027-01-04');
    expect(isoPlusDays('2024-02-20', 14)).toBe('2024-03-05'); // leap year
    expect(isoPlusDays('2026-02-20', 14)).toBe('2026-03-06');
  });

  it('crosses the end of summer time without losing a day', () => {
    // The night of 2026-10-25 is 25 hours long in Europe/Berlin: over a local
    // Date plus 14 × 86_400_000 ms this comes out as 2026-11-07 (measured).
    expect(isoPlusDays('2026-10-25', 14)).toBe('2026-11-08');
  });

  it('takes the German notation too, and refuses what is not a date', () => {
    expect(isoPlusDays('24.09.2026', 14)).toBe('2026-10-08');
    expect(isoPlusDays('', 14)).toBeNull();
    expect(isoPlusDays('2026-02-31', 14)).toBeNull();
  });
});
