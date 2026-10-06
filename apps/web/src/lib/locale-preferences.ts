import { type WatchStopHandle, computed, ref, watch } from 'vue';

import { useAuthStore } from '../stores/auth';
import { request } from './http';
import {
  type InstanceLocaleDefaults,
  type ResolvedPreferences,
  applyPreferences,
  resolvePreferences,
} from './i18n';

/**
 * Keeps the interface in the language and format the chain resolves to
 * (`resolvePreferences` in lib/i18n.ts), and follows every change of an input:
 * a login brings the profile's choice, a logout drops it again, saving the
 * profile or the instance default switches at once.
 */

/** Until the answer is in — or when it fails — the chain ends in German. */
const instanceDefaults = ref<InstanceLocaleDefaults>({ locale: null, format: null });

function browserLanguages(): readonly string[] {
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

/**
 * Asks the API for the instance's defaults — without a token, the login page
 * needs them too. A failure costs nothing but the instance default: the page
 * must load even when this one request does not.
 */
export async function loadInstanceDefaults(): Promise<void> {
  try {
    const answer = await request<{ data: InstanceLocaleDefaults }>('/locale-defaults');
    instanceDefaults.value = answer.data;
  } catch {
    // Browser and German remain; the next start asks again.
  }
}

/**
 * What the interface would show without a choice in the profile — the
 * "Automatic (currently …)" of the profile's selects.
 */
export const automaticPreferences = computed<ResolvedPreferences>(() =>
  resolvePreferences({
    profile: null,
    browser: browserLanguages(),
    instance: instanceDefaults.value,
  }),
);

/** Resolves once now and again on every change. Needs pinia installed. */
export function followLocalePreferences(): WatchStopHandle {
  const auth = useAuthStore();
  return watch(
    () =>
      resolvePreferences({
        profile: auth.user,
        browser: browserLanguages(),
        instance: instanceDefaults.value,
      }),
    applyPreferences,
    { immediate: true },
  );
}
