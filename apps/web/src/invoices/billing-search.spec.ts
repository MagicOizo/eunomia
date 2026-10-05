import { beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_BILLING_FILTER,
  apiQueryFromFilter,
  filterFromQuery,
  hitTarget,
  isActive,
  queryFromFilter,
  rememberFilter,
  rememberedFilter,
} from './billing-search';

describe('billing search filter', () => {
  beforeEach(() => {
    rememberFilter(EMPTY_BILLING_FILTER);
  });

  it('asks nothing while the text is too short and the switch is off', () => {
    expect(isActive(EMPTY_BILLING_FILTER)).toBe(false);
    expect(isActive({ q: 'L', unlinked: false })).toBe(false);
    expect(isActive({ q: ' L ', unlinked: false })).toBe(false);
    expect(isActive({ q: 'LA', unlinked: false })).toBe(true);
  });

  it('asks something with the switch alone', () => {
    expect(isActive({ q: '', unlinked: true })).toBe(true);
  });

  it('reads the filter from the URL and writes the same one back', () => {
    const query = { q: 'LA-2024', unlinked: '1' };
    const filter = filterFromQuery(query);
    expect(filter).toEqual({ q: 'LA-2024', unlinked: true });
    expect(queryFromFilter(filter)).toEqual(query);
  });

  it('keeps a bare filter a bare URL', () => {
    expect(queryFromFilter(EMPTY_BILLING_FILTER)).toEqual({});
    expect(queryFromFilter({ q: '  ', unlinked: false })).toEqual({});
  });

  it('reads anything unreadable as not set', () => {
    expect(filterFromQuery({ unlinked: 'yes', q: 42 })).toEqual(EMPTY_BILLING_FILTER);
    expect(filterFromQuery({ q: ['LA-1', 'LA-2'], unlinked: ['1'] })).toEqual({
      q: 'LA-1',
      unlinked: true,
    });
  });

  it('sends the text to the API only once it asks something', () => {
    expect(apiQueryFromFilter({ q: ' L ', unlinked: true })).toEqual({ unlinked: true });
    expect(apiQueryFromFilter({ q: ' LA-1 ', unlinked: false })).toEqual({
      q: 'LA-1',
      unlinked: false,
    });
  });

  it('remembers a copy of the last filter', () => {
    const filter = { q: 'LA', unlinked: true };
    rememberFilter(filter);
    filter.q = 'changed';
    expect(rememberedFilter()).toEqual({ q: 'LA', unlinked: true });
  });

  it('leads a hit to its policy with the row named', () => {
    expect(hitTarget({ billingUID: 'SBL_1', contractUID: 'CON_1' })).toBe(
      '/billings/CON_1?billing=SBL_1',
    );
  });
});
