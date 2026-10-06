import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type WatchStopHandle, nextTick } from 'vue';

import { useAuthStore } from '../stores/auth';
import { activeFormat, applyPreferences, i18n } from './i18n';

const request = vi.fn();
vi.mock('./http', () => ({ request: (...args: unknown[]): unknown => request(...args) }));

const { automaticPreferences, followLocalePreferences, loadInstanceDefaults } =
  await import('./locale-preferences');

const user = {
  uuid: 'u1',
  email: 'a@b.c',
  firstname: 'A',
  surname: null,
  locale: null as string | null,
  formatRegion: null as string | null,
};

describe('locale preferences', () => {
  let stop: WatchStopHandle | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    request.mockReset();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    applyPreferences({ locale: 'de', format: 'de-DE' });
    vi.restoreAllMocks();
  });

  it('follows the instance for a browser Eunomia cannot speak', async () => {
    request.mockResolvedValue({ data: { locale: 'en', format: 'en-US' } });
    await loadInstanceDefaults();
    stop = followLocalePreferences();

    expect(request).toHaveBeenCalledWith('/locale-defaults');
    expect(i18n.global.locale.value).toBe('en');
    expect(activeFormat()).toBe('en-US');
  });

  it('switches with the profile and back when the user signs out', async () => {
    request.mockResolvedValue({ data: { locale: null, format: null } });
    await loadInstanceDefaults();
    stop = followLocalePreferences();
    expect(i18n.global.locale.value).toBe('de');

    const auth = useAuthStore();
    auth.user = { ...user, locale: 'en', formatRegion: 'de-DE' };
    await nextTick();
    expect(i18n.global.locale.value).toBe('en');
    expect(activeFormat()).toBe('de-DE');

    auth.user = null;
    await nextTick();
    expect(i18n.global.locale.value).toBe('de');
  });

  it('keeps German when the defaults cannot be loaded', async () => {
    request.mockResolvedValueOnce({ data: { locale: null, format: null } });
    await loadInstanceDefaults();
    request.mockRejectedValue(new Error('offline'));
    await loadInstanceDefaults();

    expect(automaticPreferences.value).toEqual({ locale: 'de', format: 'de-DE' });
  });
});
