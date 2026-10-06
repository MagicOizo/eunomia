import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';

import { withLocale } from '../test/locale';
import { i18n, resolvePreferences } from './i18n';

describe('i18n', () => {
  it('starts in German until the preferences are resolved', () => {
    expect(i18n.global.locale.value).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('keeps the document language in step, for screen readers and hyphenation', async () => {
    await withLocale('en', async () => {
      await nextTick();
      expect(document.documentElement.lang).toBe('en');
    });
    await nextTick();
    expect(document.documentElement.lang).toBe('de');
  });
});

describe('resolvePreferences', () => {
  const none = { locale: null, formatRegion: null };
  const noInstance = { locale: null, format: null };

  it('takes the profile first, for language and format alike', () => {
    expect(
      resolvePreferences({
        profile: { locale: 'en', formatRegion: 'de-DE' },
        browser: ['de-DE'],
        instance: { locale: 'de', format: 'en-US' },
      }),
    ).toEqual({ locale: 'en', format: 'de-DE' });
  });

  it('reads the browser language by its primary subtag', () => {
    expect(resolvePreferences({ profile: none, browser: ['en-AU'], instance: noInstance })).toEqual(
      // en-AU is no format of ours, so the format comes from the language.
      { locale: 'en', format: 'en-GB' },
    );
  });

  it('skips browser languages Eunomia does not speak', () => {
    expect(
      resolvePreferences({ profile: null, browser: ['fr-FR', 'en-US'], instance: noInstance }),
    ).toEqual({ locale: 'en', format: 'en-US' });
  });

  it('takes a browser region only when it matches exactly', () => {
    expect(
      resolvePreferences({
        profile: null,
        browser: ['de-AT'],
        instance: { locale: null, format: 'en-US' },
      }),
    ).toEqual({ locale: 'de', format: 'en-US' });
  });

  it('falls back to the instance when the browser speaks nothing supported', () => {
    expect(
      resolvePreferences({
        profile: null,
        browser: ['fr-FR'],
        instance: { locale: 'en', format: null },
      }),
    ).toEqual({ locale: 'en', format: 'en-GB' });
  });

  it('ends in German when nothing names a language', () => {
    expect(resolvePreferences({ profile: null, browser: [], instance: noInstance })).toEqual({
      locale: 'de',
      format: 'de-DE',
    });
  });

  it('skips stored values the lists do not know, as if they were empty', () => {
    expect(
      resolvePreferences({
        profile: { locale: 'fr', formatRegion: 'fr-FR' },
        browser: [],
        instance: { locale: 'xx', format: 'yy' },
      }),
    ).toEqual({ locale: 'de', format: 'de-DE' });
  });
});
