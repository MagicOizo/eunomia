import { i18n, type Locale } from '../lib/i18n';

/**
 * Runs a test body in another UI language and returns to German afterwards,
 * even when the body throws — the next test must not inherit the language.
 */
export async function withLocale(locale: Locale, body: () => unknown): Promise<void> {
  i18n.global.locale.value = locale;
  try {
    await body();
  } finally {
    i18n.global.locale.value = 'de';
  }
}
