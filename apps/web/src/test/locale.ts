import type { FormatRegion } from '@eunomia/shared';

import { formatOverride, i18n, type Locale } from '../lib/i18n';

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
    formatOverride.value = null;
  }
}

/** Runs a test body with numbers and dates in another format, the language untouched. */
export async function withFormat(region: FormatRegion, body: () => unknown): Promise<void> {
  formatOverride.value = region;
  try {
    await body();
  } finally {
    formatOverride.value = null;
  }
}
