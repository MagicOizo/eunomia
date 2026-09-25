import { describe, expect, it } from 'vitest';

import { isoFromGerman } from './date-input';

describe('isoFromGerman', () => {
  it('reads the German notation a spreadsheet puts on the clipboard', () => {
    expect(isoFromGerman('24.09.2026')).toBe('2026-09-24');
    expect(isoFromGerman('4.9.2026')).toBe('2026-09-04');
    expect(isoFromGerman('  24.09.2026  ')).toBe('2026-09-24');
  });

  it('passes ISO text through, so a copy out of the app itself still works', () => {
    expect(isoFromGerman('2026-09-24')).toBe('2026-09-24');
  });

  it('refuses a two-digit year instead of guessing a century', () => {
    // 15.03.57 is a birth date in 1957 to a human and 2057 to a naive parser.
    expect(isoFromGerman('24.09.26')).toBeNull();
    expect(isoFromGerman('15.03.57')).toBeNull();
  });

  it('refuses a day the month does not have', () => {
    expect(isoFromGerman('31.02.2026')).toBeNull();
    expect(isoFromGerman('29.02.2026')).toBeNull();
    expect(isoFromGerman('29.02.2024')).toBe('2024-02-29'); // leap year
    expect(isoFromGerman('31.04.2026')).toBeNull();
    expect(isoFromGerman('00.09.2026')).toBeNull();
    expect(isoFromGerman('24.13.2026')).toBeNull();
    expect(isoFromGerman('2026-02-31')).toBeNull();
  });

  it('leaves anything else to the browser', () => {
    for (const text of ['', '   ', 'morgen', '24/09/2026', '24.09.2026 08:15', '20260924']) {
      expect(isoFromGerman(text)).toBeNull();
    }
  });
});
