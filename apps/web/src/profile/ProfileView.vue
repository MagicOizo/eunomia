<script setup lang="ts">
import { faCircleCheck, faKey } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { isFormatRegion, isLocale } from '@eunomia/shared';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuSelectField from '../components/resource/EuSelectField.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { describeError } from '../lib/errors';
import { formatName, formatOptions, languageName, languageOptions } from '../lib/locale-options';
import { automaticPreferences } from '../lib/locale-preferences';
import { useAuthStore } from '../stores/auth';
import { changePassword, updateLocalePreferences } from './api';

/**
 * The user's own account (Slice 7 of the review slices, SEC-06). Until now a
 * password could only be set by an administrator, who then knew it — and there
 * was no way at all to be asked for the old one. This is that way, and the only
 * one: the admin API refuses a password change on one's own account.
 */

/** The server's minimum, repeated here so the field can say so before sending. */
const MIN_LENGTH = 8;

const auth = useAuthStore();
const { t } = useI18n();

const currentPassword = ref('');
const newPassword = ref('');
const repeatPassword = ref('');

const busy = ref(false);
const error = ref<string | null>(null);
const done = ref(false);
/** Shown under the field it belongs to, not as one message for the whole form. */
const newPasswordError = ref<string | null>(null);
const repeatError = ref<string | null>(null);

const fullName = computed(() => {
  const user = auth.user;
  if (!user) return '';
  return user.surname ? `${user.firstname} ${user.surname}` : user.firstname;
});

/*
 * Language and format: saved the moment one is picked, and the interface
 * switches with the answer (lib/locale-preferences.ts follows the store). The
 * empty entry says what "automatic" amounts to right now. A stored value the
 * lists do not know (edited by hand) shows as automatic, which is what it does.
 */
const chosenLocale = computed(() => (isLocale(auth.user?.locale) ? auth.user.locale : ''));
const chosenFormat = computed(() =>
  isFormatRegion(auth.user?.formatRegion) ? auth.user.formatRegion : '',
);
const automaticLocale = computed(() =>
  t('localeChoice.automatic', { current: languageName(automaticPreferences.value.locale) }),
);
const automaticFormat = computed(() =>
  t('localeChoice.automatic', { current: formatName(automaticPreferences.value.format) }),
);
// Computed, so the format names follow a change of language.
const localeOptions = computed(() => languageOptions());
const regionOptions = computed(() => formatOptions());

const preferenceBusy = ref(false);
const preferenceError = ref<string | null>(null);
const preferenceSaved = ref(false);

async function savePreference(field: 'locale' | 'formatRegion', value: string): Promise<void> {
  preferenceError.value = null;
  preferenceSaved.value = false;
  preferenceBusy.value = true;
  try {
    const body =
      field === 'locale'
        ? { locale: isLocale(value) ? value : null }
        : { formatRegion: isFormatRegion(value) ? value : null };
    auth.user = await updateLocalePreferences(body);
    preferenceSaved.value = true;
  } catch (caught) {
    preferenceError.value = describeError(caught);
  } finally {
    preferenceBusy.value = false;
  }
}

/** The two checks the browser can make itself, so a typo costs no round trip. */
function validate(): boolean {
  newPasswordError.value =
    newPassword.value.length < MIN_LENGTH ? t('profile.tooShort', { min: MIN_LENGTH }) : null;
  repeatError.value = repeatPassword.value === newPassword.value ? null : t('profile.mismatch');
  return newPasswordError.value === null && repeatError.value === null;
}

async function submit(): Promise<void> {
  error.value = null;
  done.value = false;
  if (!validate()) return;

  busy.value = true;
  try {
    await changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    currentPassword.value = '';
    newPassword.value = '';
    repeatPassword.value = '';
    done.value = true;
  } catch (caught) {
    error.value = describeError(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="eu-profile">
    <!-- No heading of its own: AppHeader renders the route title as the page's
         h1, and the sections below are its h2s (like SettingsView). -->
    <EuCollapsibleSection :title="t('profile.signedInAs')">
      <dl v-if="auth.user" class="eu-profile__facts">
        <dt>{{ t('profile.name') }}</dt>
        <dd>{{ fullName }}</dd>
        <dt>{{ t('profile.email') }}</dt>
        <dd>{{ auth.user.email }}</dd>
      </dl>
      <p class="eu-profile__hint">{{ t('profile.changeByAdmin') }}</p>
    </EuCollapsibleSection>

    <EuCollapsibleSection :title="t('localeChoice.title')">
      <p class="eu-profile__hint">{{ t('localeChoice.lead') }}</p>
      <div class="eu-profile__form eu-profile__form--wide">
        <EuSelectField
          :model-value="chosenLocale"
          :label="t('localeChoice.language')"
          :options="localeOptions"
          :empty-label="automaticLocale"
          :disabled="preferenceBusy"
          @update:model-value="savePreference('locale', $event)"
        />
        <EuSelectField
          :model-value="chosenFormat"
          :label="t('localeChoice.format')"
          :options="regionOptions"
          :empty-label="automaticFormat"
          :disabled="preferenceBusy"
          @update:model-value="savePreference('formatRegion', $event)"
        />
        <p v-if="preferenceSaved" class="eu-profile__ok" role="status">
          <FontAwesomeIcon :icon="faCircleCheck" aria-hidden="true" />
          {{ t('localeChoice.saved') }}
        </p>
        <p v-if="preferenceError" class="eu-profile__error" role="alert">{{ preferenceError }}</p>
      </div>
    </EuCollapsibleSection>

    <EuCollapsibleSection :title="t('profile.password')">
      <p class="eu-profile__hint">{{ t('profile.passwordLead', { min: MIN_LENGTH }) }}</p>
      <form class="eu-profile__form" @submit.prevent="submit">
        <EuTextField
          v-model="currentPassword"
          type="password"
          :label="t('profile.currentPassword')"
          autocomplete="current-password"
        />
        <EuTextField
          v-model="newPassword"
          type="password"
          :label="t('profile.newPassword')"
          autocomplete="new-password"
          :error="newPasswordError ?? undefined"
        />
        <EuTextField
          v-model="repeatPassword"
          type="password"
          :label="t('profile.repeatPassword')"
          autocomplete="new-password"
          :error="repeatError ?? undefined"
        />
        <div class="eu-profile__actions">
          <EuButton
            type="submit"
            :icon="faKey"
            :disabled="busy || currentPassword === '' || newPassword === ''"
          >
            {{ t('profile.change') }}
          </EuButton>
        </div>
        <p v-if="done" class="eu-profile__ok" role="status">
          <FontAwesomeIcon :icon="faCircleCheck" aria-hidden="true" />
          {{ t('profile.changed') }}
        </p>
        <p v-if="error" class="eu-profile__error" role="alert">{{ error }}</p>
      </form>
    </EuCollapsibleSection>
  </div>
</template>

<style scoped>
.eu-profile {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-profile__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
  width: 100%;
  /* The fields stay as narrow as what goes in them; the sentence above the form
     is not held to that width, which is why it sits outside it. */
  max-width: 24rem;
  margin-top: 1rem;
}

.eu-profile__form--wide {
  /* The format entries carry a sample date and amount ("Automatisch —
     US-amerikanisch (12/31/2026 · €1,234.56)"); at the password fields' width
     the select cuts it off. */
  max-width: 32rem;
}

.eu-profile__form > * {
  width: 100%;
}

.eu-profile__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  margin: 0 0 1rem;
  font-family: var(--eu-font-data);
}

.eu-profile__facts dt {
  color: var(--eu-color-text-muted);
}

.eu-profile__facts dd {
  margin: 0;
}

.eu-profile__hint,
.eu-profile__ok,
.eu-profile__error {
  margin: 0;
  font-family: var(--eu-font-data);
  max-width: 44rem;
}

.eu-profile__hint {
  font-size: 0.875rem;
  color: var(--eu-color-text-muted);
}

.eu-profile__ok {
  color: var(--eu-color-status-done-fg);
}

.eu-profile__error {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  padding: 0.6em 0.9em;
  border-radius: 0.375em;
  background-color: var(--eu-color-error-bg);
  color: var(--eu-color-error-fg);
}

.eu-profile__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
</style>
