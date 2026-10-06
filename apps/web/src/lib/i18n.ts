import { watch } from 'vue';
import { createI18n } from 'vue-i18n';

import de from '../locales/de.json';
import en from '../locales/en.json';

/**
 * The UI's languages and the catalogue they read from (see
 * src/locales/README.md). German is the source language: `de.json` is the
 * schema every other catalogue is checked against, so a key missing from
 * `en.json` fails the type check rather than showing up as a raw key at
 * runtime.
 */

export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type MessageSchema = typeof de;

declare module 'vue-i18n' {
  // Types `t('…')` against the German catalogue — an unknown key does not compile.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * The language the app starts in. Until the whole UI is translated it is
 * German for everyone: detection from the profile and the browser is switched
 * on only once no screen is left half German. The dev build alone takes
 * `?lang=en` (or `de`) on the page it is loaded with, so a translated area can
 * be looked at while the rest is still being moved. It holds for the SPA
 * session, not beyond a reload — remembering it would need browser storage,
 * which the SPA does not touch (invariant I-8, stores/auth.spec.ts).
 */
function initialLocale(): Locale {
  if (!import.meta.env.DEV) return 'de';
  const requested = new URLSearchParams(window.location.search).get('lang');
  return isLocale(requested) ? requested : 'de';
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'de',
  messages: { de, en },
});

// Screen readers and the browser's hyphenation read the document language.
watch(
  i18n.global.locale,
  (locale) => {
    document.documentElement.lang = locale;
  },
  { immediate: true },
);
