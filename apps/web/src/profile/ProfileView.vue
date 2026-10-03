<script setup lang="ts">
import { faCircleCheck, faKey } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { describeError } from '../lib/errors';
import { useAuthStore } from '../stores/auth';
import { changePassword } from './api';

/**
 * The user's own account (Slice 7 of the review slices, SEC-06). Until now a
 * password could only be set by an administrator, who then knew it — and there
 * was no way at all to be asked for the old one. This is that way, and the only
 * one: the admin API refuses a password change on one's own account.
 */

/** The server's minimum, repeated here so the field can say so before sending. */
const MIN_LENGTH = 8;

const auth = useAuthStore();

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

/** The two checks the browser can make itself, so a typo costs no round trip. */
function validate(): boolean {
  newPasswordError.value =
    newPassword.value.length < MIN_LENGTH
      ? `Das neue Passwort muss mindestens ${MIN_LENGTH} Zeichen haben.`
      : null;
  repeatError.value =
    repeatPassword.value === newPassword.value
      ? null
      : 'Die Wiederholung stimmt nicht mit dem neuen Passwort überein.';
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
    <EuCollapsibleSection title="Angemeldet als">
      <dl v-if="auth.user" class="eu-profile__facts">
        <dt>Name</dt>
        <dd>{{ fullName }}</dd>
        <dt>E-Mail</dt>
        <dd>{{ auth.user.email }}</dd>
      </dl>
      <p class="eu-profile__hint">
        Name und E-Mail-Adresse ändert die Benutzerverwaltung. Wende dich dafür an einen
        Administrator.
      </p>
    </EuCollapsibleSection>

    <EuCollapsibleSection title="Passwort">
      <p class="eu-profile__hint">
        Mindestens {{ MIN_LENGTH }} Zeichen. Mit dem neuen Passwort endet jede andere Sitzung dieses
        Kontos — auf anderen Geräten und in anderen Browsern musst du dich neu anmelden. Diese hier
        bleibt angemeldet.
      </p>
      <form class="eu-profile__form" @submit.prevent="submit">
        <EuTextField
          v-model="currentPassword"
          type="password"
          label="Aktuelles Passwort"
          autocomplete="current-password"
        />
        <EuTextField
          v-model="newPassword"
          type="password"
          label="Neues Passwort"
          autocomplete="new-password"
          :error="newPasswordError ?? undefined"
        />
        <EuTextField
          v-model="repeatPassword"
          type="password"
          label="Neues Passwort wiederholen"
          autocomplete="new-password"
          :error="repeatError ?? undefined"
        />
        <div class="eu-profile__actions">
          <EuButton
            type="submit"
            :icon="faKey"
            :disabled="busy || currentPassword === '' || newPassword === ''"
          >
            Passwort ändern
          </EuButton>
        </div>
        <p v-if="done" class="eu-profile__ok" role="status">
          <FontAwesomeIcon :icon="faCircleCheck" aria-hidden="true" />
          Passwort geändert. Alle anderen Sitzungen sind beendet.
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
