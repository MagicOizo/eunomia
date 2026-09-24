import { describe, expect, it } from 'vitest';

import { appTitle } from './app-info';

describe('appTitle', () => {
  it('leaves production unmarked', () => {
    expect(appTitle('production')).toBe('Eunomia');
  });

  it('marks development so a DEV tab is recognisable', () => {
    expect(appTitle('development')).toBe('Eunomia-DEV');
  });

  it('marks any other environment by its own name', () => {
    expect(appTitle('test')).toBe('Eunomia-TEST');
    expect(appTitle('staging')).toBe('Eunomia-STAGING');
  });

  it('falls back to the bare name when the API says nothing', () => {
    // The endpoint could not be reached, or answered without the field.
    expect(appTitle(null)).toBe('Eunomia');
    expect(appTitle('  ')).toBe('Eunomia');
  });
});
