import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';

import { withLocale } from '../test/locale';
import { i18n } from './i18n';

describe('i18n', () => {
  it('starts in German outside the dev switch', () => {
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
