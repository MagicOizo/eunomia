import { describe, expect, it } from 'vitest';

import { withFormat } from '../test/locale';
import { furtherDays, normalizeDays, sameCalendarYear, treatmentDaysLabel } from './treatment-days';

describe('normalizeDays', () => {
  it('sorts the days and drops blanks and duplicates', () => {
    expect(normalizeDays(['2020-02-17', '', '2020-02-03', '2020-02-17'])).toEqual([
      '2020-02-03',
      '2020-02-17',
    ]);
  });

  it('is empty when nothing was filled in', () => {
    expect(normalizeDays(['', ''])).toEqual([]);
  });
});

describe('sameCalendarYear', () => {
  it('accepts days of one year', () => {
    expect(sameCalendarYear(['2020-01-01', '2020-12-31'])).toBe(true);
  });

  it('refuses days across the turn of the year', () => {
    expect(sameCalendarYear(['2020-12-28', '2021-01-04'])).toBe(false);
  });

  it('accepts nothing at all — there is no second year yet', () => {
    expect(sameCalendarYear([])).toBe(true);
  });
});

describe('furtherDays', () => {
  it('leaves out the leading day', () => {
    const invoice = {
      treatmentDate: '2020-02-03',
      treatmentDates: ['2020-02-03', '2020-02-10', '2020-02-17'],
    };
    expect(furtherDays(invoice)).toEqual(['2020-02-10', '2020-02-17']);
  });

  it('is empty for an invoice billing one day', () => {
    expect(furtherDays({ treatmentDate: '2020-02-03', treatmentDates: ['2020-02-03'] })).toEqual(
      [],
    );
  });
});

describe('treatmentDaysLabel', () => {
  it('is the plain date for one day', () => {
    expect(treatmentDaysLabel(['2020-02-17'])).toBe('17.02.2020');
  });

  it('is the span without repeating the year', () => {
    expect(treatmentDaysLabel(['2020-02-10', '2020-02-17', '2020-02-03'])).toBe(
      '03.02.–17.02.2020',
    );
  });

  it('drops the year in the short form of each format', async () => {
    const days = ['2020-02-03', '2020-02-17'];
    await withFormat('en-GB', () => expect(treatmentDaysLabel(days)).toBe('03/02–17/02/2020'));
    await withFormat('en-US', () => expect(treatmentDaysLabel(days)).toBe('02/03–02/17/2020'));
  });

  it('spells out both years where they differ', () => {
    expect(treatmentDaysLabel(['2020-12-28', '2021-01-04'])).toBe('28.12.2020 – 04.01.2021');
  });

  it('is a dash without days', () => {
    expect(treatmentDaysLabel([])).toBe('–');
  });
});
