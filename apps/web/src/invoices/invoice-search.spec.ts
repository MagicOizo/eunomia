import { beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_FILTER,
  apiQueryFromFilter,
  asStatus,
  filterFromQuery,
  hitTarget,
  isActive,
  queryFromFilter,
  rememberFilter,
  rememberedFilter,
} from './invoice-search';

describe('invoice search filter', () => {
  beforeEach(() => {
    rememberFilter(EMPTY_FILTER);
  });

  it('asks nothing while the number is too short and nothing else is set', () => {
    expect(isActive(EMPTY_FILTER)).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, q: 'R' })).toBe(false);
    expect(isActive({ ...EMPTY_FILTER, q: 'R-' })).toBe(true);
  });

  it('asks something as soon as a reference or a status is chosen', () => {
    expect(isActive({ ...EMPTY_FILTER, agencyUID: 'AGY_1' })).toBe(true);
    expect(isActive({ ...EMPTY_FILTER, facilityUID: 'FAC_1' })).toBe(true);
    expect(isActive({ ...EMPTY_FILTER, status: 'nicht-erledigt' })).toBe(true);
  });

  it('reads the filter from the URL and writes the same one back', () => {
    const query = {
      q: 'R-2024',
      agency: 'AGY_1',
      account: 'AGA_2',
      facility: 'FAC_3',
      status: 'offen',
    };
    const filter = filterFromQuery(query);
    expect(filter).toEqual({
      q: 'R-2024',
      agencyUID: 'AGY_1',
      agencyAccountUID: 'AGA_2',
      facilityUID: 'FAC_3',
      status: 'offen',
    });
    expect(queryFromFilter(filter)).toEqual(query);
  });

  it('names the parameters the API knows, not the short ones of the URL', () => {
    const filter = {
      q: 'R-2024',
      agencyUID: 'AGY_1',
      agencyAccountUID: 'AGA_2',
      facilityUID: 'FAC_3',
      status: 'nicht-erledigt' as const,
    };
    expect(apiQueryFromFilter(filter)).toEqual({
      q: 'R-2024',
      agencyUID: 'AGY_1',
      agencyAccountUID: 'AGA_2',
      facilityUID: 'FAC_3',
      status: 'nicht-erledigt',
    });
    expect(apiQueryFromFilter(EMPTY_FILTER)).toEqual({});
  });

  it('leaves out what is not set, so a bare page keeps a bare URL', () => {
    expect(queryFromFilter(EMPTY_FILTER)).toEqual({});
    expect(queryFromFilter({ ...EMPTY_FILTER, q: '  R-1  ' })).toEqual({ q: 'R-1' });
  });

  it('drops a bank account that comes without its agency', () => {
    expect(filterFromQuery({ account: 'AGA_2' }).agencyAccountUID).toBe('');
    expect(filterFromQuery({ agency: 'AGY_1', account: 'AGA_2' }).agencyAccountUID).toBe('AGA_2');
  });

  it('does not pass an unknown status on to the API', () => {
    expect(asStatus('erledigt')).toBe('erledigt');
    expect(asStatus('nicht-erledigt')).toBe('nicht-erledigt');
    expect(asStatus('bezahlt')).toBe('');
    expect(filterFromQuery({ status: 'bezahlt' }).status).toBe('');
  });

  it('remembers the last filter for the way back', () => {
    expect(rememberedFilter()).toEqual(EMPTY_FILTER);
    rememberFilter({ ...EMPTY_FILTER, agencyUID: 'AGY_1' });
    expect(rememberedFilter().agencyUID).toBe('AGY_1');
    // A copy, so the page cannot change what was remembered by accident.
    const remembered = rememberedFilter();
    remembered.agencyUID = 'AGY_9';
    expect(rememberedFilter().agencyUID).toBe('AGY_1');
  });

  it('points a hit at its year and its row in the workspace', () => {
    expect(hitTarget({ invoiceUID: 'inv-1', accountUID: 'a-1', treatmentDate: '2024-03-14' })).toBe(
      '/invoices/a-1?year=2024&invoice=inv-1',
    );
  });
});
