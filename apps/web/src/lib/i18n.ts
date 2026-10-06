import {
  DEFAULT_FORMAT,
  type FormatRegion,
  isFormatRegion,
  isLocale,
  type Locale,
} from '@eunomia/shared';
import { ref, watch } from 'vue';
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

export type MessageSchema = typeof de;

declare module 'vue-i18n' {
  // Types `t('…')` against the German catalogue — an unknown key does not compile.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  // German until lib/locale-preferences.ts has resolved the real choice at
  // startup — and for good in the tests, which never run that resolution
  // (jsdom would report an English browser).
  locale: 'de',
  fallbackLocale: 'de',
  messages: { de, en },
});

/** A user's own choice as the profile stores it (`null` = follow). */
export interface LocaleChoice {
  locale: string | null;
  formatRegion: string | null;
}

/** The instance's defaults from the system settings (GET /locale-defaults). */
export interface InstanceLocaleDefaults {
  locale: string | null;
  format: string | null;
}

export interface ResolvedPreferences {
  locale: Locale;
  format: FormatRegion;
}

/**
 * Language and format, each from the first source that names one Eunomia
 * supports (Notes/eunomia-plan.md, package Localization):
 *
 *  - language: profile → browser (by primary subtag, so `en-AU` reads as `en`)
 *    → instance default → German;
 *  - format: profile → browser (only an exact region — `de-AT` is not
 *    `de-DE`) → instance default → the language's own.
 *
 * Stored values are strings, not checked types: a language removed from the
 * lists or a row edited by hand is skipped like an empty one. Mails resolve
 * the same chain without the browser (apps/api/src/mail/catalog.ts).
 */
export function resolvePreferences(input: {
  profile: LocaleChoice | null;
  browser: readonly string[];
  instance: InstanceLocaleDefaults;
}): ResolvedPreferences {
  const { profile, browser, instance } = input;
  const locale =
    [
      profile?.locale,
      ...browser.map((tag) => tag.split('-')[0]?.toLowerCase()),
      instance.locale,
    ].find(isLocale) ?? 'de';
  const format =
    [profile?.formatRegion, ...browser, instance.format].find(isFormatRegion) ??
    DEFAULT_FORMAT[locale];
  return { locale, format };
}

/**
 * The dev build alone takes `?lang=en` and `?format=en-US` on the page it is
 * loaded with, ahead of every other source, so a screen can be looked at in
 * another language without changing the profile. Held until a reload — and
 * not beyond: remembering it would need browser storage, which the SPA does
 * not touch (invariant I-8, stores/auth.spec.ts).
 */
function devOverride(): { locale: Locale | null; format: FormatRegion | null } {
  if (!import.meta.env.DEV) return { locale: null, format: null };
  const query = new URLSearchParams(window.location.search);
  const locale = query.get('lang');
  const format = query.get('format');
  return {
    locale: isLocale(locale) ? locale : null,
    format: isFormatRegion(format) ? format : null,
  };
}

const override = devOverride();

/** The chosen format, or null to follow the language. */
export const formatOverride = ref<FormatRegion | null>(null);

/**
 * The format in effect. Reads both refs, so a template or computed that
 * formats through it follows a change of either.
 */
export function activeFormat(): FormatRegion {
  return formatOverride.value ?? DEFAULT_FORMAT[i18n.global.locale.value];
}

/**
 * Switches the interface to what the chain resolves to. The dev query still
 * wins, and a `?lang` without `?format` lets the format follow that language,
 * as it did before detection existed.
 */
export function applyPreferences(resolved: ResolvedPreferences): void {
  i18n.global.locale.value = override.locale ?? resolved.locale;
  formatOverride.value = override.format ?? (override.locale ? null : resolved.format);
}

// Screen readers and the browser's hyphenation read the document language.
watch(
  i18n.global.locale,
  (locale) => {
    document.documentElement.lang = locale;
  },
  { immediate: true },
);
