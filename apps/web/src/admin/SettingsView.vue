<script setup lang="ts">
import {
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faPaperPlane,
  faRotate,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, reactive, ref } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { describeError } from '../lib/errors';
import { germanDateTime } from '../lib/format';
import { settingLabel } from '../lib/field-labels';
import {
  type MailStatus,
  type PublicSetting,
  type SettingWrite,
  type SettingsSnapshot,
  type UpdateStatus,
  loadSettings,
  loadUpdateStatus,
  refreshUpdateStatus,
  saveSettings,
  sendTestMail,
} from './settings-api';

/**
 * System settings (Slice 30). The first area of the admin section: which version
 * runs and whether a newer one exists, and the SMTP account the app sends
 * through — including a test that proves it works and a status that survives a
 * restart.
 */

const loading = ref(true);
const loadError = ref<string | null>(null);
const snapshot = ref<SettingsSnapshot | null>(null);
const update = ref<UpdateStatus | null>(null);

const mailBusy = ref(false);
const mailError = ref<string | null>(null);
const mailSaved = ref(false);
const testBusy = ref(false);
const testResult = ref<string | null>(null);

const updateBusy = ref(false);
const updateError = ref<string | null>(null);
const tokenSaved = ref(false);

/** The editable mail form, filled from the snapshot on load. */
const mail = reactive({
  enabled: false,
  host: '',
  port: '587',
  secure: false,
  user: '',
  fromAddress: '',
  fromName: '',
  /** Empty means "leave the stored password alone". */
  password: '',
});
const passwordStored = ref(false);
/** Token field, same rule as the password: empty means unchanged. */
const token = ref('');
const tokenStored = ref(false);

function valueOf(settings: PublicSetting[], key: string): PublicSetting | undefined {
  return settings.find((entry) => entry.key === key);
}

function applySnapshot(next: SettingsSnapshot): void {
  snapshot.value = next;
  const { settings } = next;
  mail.enabled = valueOf(settings, 'mail.enabled')?.value === true;
  mail.host = String(valueOf(settings, 'mail.host')?.value ?? '');
  mail.port = String(valueOf(settings, 'mail.port')?.value ?? '587');
  mail.secure = valueOf(settings, 'mail.secure')?.value === true;
  mail.user = String(valueOf(settings, 'mail.user')?.value ?? '');
  mail.fromAddress = String(valueOf(settings, 'mail.fromAddress')?.value ?? '');
  mail.fromName = String(valueOf(settings, 'mail.fromName')?.value ?? '');
  mail.password = '';
  passwordStored.value = valueOf(settings, 'mail.password')?.isSet === true;
  token.value = '';
  tokenStored.value = valueOf(settings, 'updateCheck.token')?.isSet === true;
}

const encryptionAvailable = computed(() => snapshot.value?.encryptionAvailable !== false);
const mailStatus = computed<MailStatus | null>(() => snapshot.value?.mailStatus ?? null);

onMounted(async () => {
  try {
    applySnapshot(await loadSettings());
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
  // Separate request, separate failure: a GitHub hiccup must not hide the
  // settings form.
  try {
    update.value = await loadUpdateStatus();
  } catch (error) {
    updateError.value = describeError(error);
  }
});

const portError = computed(() => {
  if (mail.port.trim() === '') return undefined;
  const parsed = Number(mail.port);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? undefined
    : 'Bitte eine Portnummer zwischen 1 und 65535 angeben.';
});

async function saveMail(): Promise<void> {
  if (portError.value) return;
  mailBusy.value = true;
  mailError.value = null;
  mailSaved.value = false;
  try {
    const values: SettingWrite = {
      'mail.enabled': mail.enabled,
      'mail.host': mail.host,
      'mail.port': mail.port.trim() === '' ? 587 : Number(mail.port),
      'mail.secure': mail.secure,
      'mail.user': mail.user,
      'mail.fromAddress': mail.fromAddress,
      'mail.fromName': mail.fromName,
    };
    // Only send the password when one was typed — an untouched field must not
    // overwrite what is stored.
    if (mail.password !== '') values['mail.password'] = mail.password;
    applySnapshot(await saveSettings(values));
    mailSaved.value = true;
  } catch (error) {
    mailError.value = describeError(error);
  } finally {
    mailBusy.value = false;
  }
}

async function clearPassword(): Promise<void> {
  mailBusy.value = true;
  mailError.value = null;
  try {
    applySnapshot(await saveSettings({ 'mail.password': null }));
  } catch (error) {
    mailError.value = describeError(error);
  } finally {
    mailBusy.value = false;
  }
}

async function runTest(): Promise<void> {
  testBusy.value = true;
  testResult.value = null;
  mailError.value = null;
  try {
    const { recipient } = await sendTestMail();
    testResult.value = `Testmail an ${recipient} versendet.`;
    applySnapshot(await loadSettings());
  } catch (error) {
    mailError.value = describeError(error);
    // The failed attempt is part of the status now, so pick it up.
    try {
      applySnapshot(await loadSettings());
    } catch {
      /* the message above is what matters */
    }
  } finally {
    testBusy.value = false;
  }
}

async function saveToken(): Promise<void> {
  // An empty field means "leave the stored token alone". Submitting it would
  // send '', which the API reads as "clear this secret" — pressing Enter in the
  // empty field would silently delete the token. Removing it is the explicit
  // button next to this one.
  if (token.value === '') return;
  updateBusy.value = true;
  updateError.value = null;
  tokenSaved.value = false;
  try {
    applySnapshot(await saveSettings({ 'updateCheck.token': token.value }));
    tokenSaved.value = true;
    // A fresh token deserves a fresh answer instead of the cached failure.
    update.value = await refreshUpdateStatus();
  } catch (error) {
    updateError.value = describeError(error);
  } finally {
    updateBusy.value = false;
  }
}

async function clearToken(): Promise<void> {
  updateBusy.value = true;
  updateError.value = null;
  try {
    applySnapshot(await saveSettings({ 'updateCheck.token': null }));
    update.value = await refreshUpdateStatus();
  } catch (error) {
    updateError.value = describeError(error);
  } finally {
    updateBusy.value = false;
  }
}

async function checkNow(): Promise<void> {
  updateBusy.value = true;
  updateError.value = null;
  try {
    update.value = await refreshUpdateStatus();
  } catch (error) {
    updateError.value = describeError(error);
  } finally {
    updateBusy.value = false;
  }
}

/** The state of the update check in words — the footer can only stay silent. */
const updateSentence = computed(() => {
  const status = update.value;
  if (!status) return 'Der Stand der Aktualisierung ist noch nicht abgefragt.';
  if (status.status === 'disabled') {
    return 'Die Update-Prüfung ist per Konfiguration abgeschaltet (UPDATE_CHECK_ENABLED=false).';
  }
  if (status.status === 'unavailable') {
    switch (status.reason) {
      case 'no_token_private':
        return 'GitHub antwortet mit „nicht gefunden". Das Repository ist privat — dafür braucht die Prüfung ein GitHub-Token mit Lesezugriff (siehe unten).';
      case 'not_found':
        return 'GitHub findet das eingestellte Repository nicht, obwohl ein Token gesendet wurde. Bitte UPDATE_CHECK_REPO und die Rechte des Tokens prüfen.';
      case 'unauthorized':
        return 'GitHub hat das Token abgelehnt. Bitte ein gültiges Token mit Lesezugriff hinterlegen.';
      case 'rate_limited':
        return 'Das Anfragelimit von GitHub ist erreicht. Die Prüfung versucht es später erneut.';
      case 'no_release':
        return 'Es gibt noch keine veröffentlichte Version, gegen die verglichen werden könnte.';
      default:
        return 'GitHub war nicht erreichbar. Ohne Internetverbindung bleibt die Prüfung ohne Ergebnis.';
    }
  }
  if (status.updateAvailable) return `Version ${status.latest} ist verfügbar.`;
  return 'Diese Instanz läuft auf der neuesten veröffentlichten Version.';
});

const updateTone = computed<'done' | 'submitted' | 'neutral'>(() => {
  const status = update.value;
  if (!status || status.status !== 'ok') return 'neutral';
  return status.updateAvailable ? 'submitted' : 'done';
});
</script>

<template>
  <div class="eu-settings">
    <!-- No heading of its own: AppHeader already renders the route title as the
         page's h1, and the sections below are its h2s (like BillingsView). -->
    <p v-if="loading" class="eu-settings__hint">Einstellungen werden geladen…</p>
    <p v-else-if="loadError" class="eu-settings__error" role="alert">{{ loadError }}</p>

    <template v-else>
      <p v-if="!encryptionAvailable" class="eu-settings__error" role="alert">
        <FontAwesomeIcon :icon="faCircleExclamation" aria-hidden="true" />
        In der Server-Umgebung fehlt <code>CONFIG_ENCRYPTION_KEY</code>. Passwörter und Token können
        deshalb nicht gespeichert werden — alle übrigen Einstellungen schon.
      </p>

      <EuCollapsibleSection title="Version und Aktualisierung">
        <template #status>
          <EuBadge :tone="updateTone">
            {{ update?.current ? `v${update.current}` : 'Version unbekannt' }}
          </EuBadge>
        </template>

        <dl class="eu-settings__facts">
          <dt>Laufende Version</dt>
          <dd>{{ update?.current ?? '–' }}</dd>
          <dt>Neueste veröffentlichte Version</dt>
          <dd>{{ update?.latest ?? '–' }}</dd>
          <dt>Zuletzt geprüft</dt>
          <dd>{{ update?.checkedAt ? germanDateTime(update.checkedAt) : 'noch nicht' }}</dd>
        </dl>

        <p class="eu-settings__sentence">
          <FontAwesomeIcon
            :icon="update?.status === 'ok' ? faCircleCheck : faCircleInfo"
            aria-hidden="true"
          />
          {{ updateSentence }}
        </p>

        <div class="eu-settings__actions">
          <EuButton variant="secondary" :icon="faRotate" :disabled="updateBusy" @click="checkNow">
            Jetzt prüfen
          </EuButton>
          <a
            v-if="update?.releaseUrl"
            class="eu-settings__link"
            :href="update.releaseUrl"
            target="_blank"
            rel="noreferrer noopener"
          >
            Release-Notes öffnen (neuer Tab)
          </a>
        </div>

        <form class="eu-settings__form" @submit.prevent="saveToken">
          <EuTextField
            v-model="token"
            type="password"
            :label="settingLabel('updateCheck.token')"
            :error="undefined"
          />
          <p class="eu-settings__hint">
            {{
              tokenStored
                ? 'Ein Token ist hinterlegt. Das Feld bleibt leer — eine Eingabe ersetzt es.'
                : 'Ohne Token kann eine private Instanz die Releases nicht lesen. Ein Token mit reinem Lesezugriff genügt.'
            }}
          </p>
          <div class="eu-settings__actions">
            <EuButton type="submit" :disabled="updateBusy || token === ''">
              Token speichern
            </EuButton>
            <EuButton
              v-if="tokenStored"
              variant="ghost"
              :icon="faTrash"
              :disabled="updateBusy"
              @click="clearToken"
            >
              Token entfernen
            </EuButton>
          </div>
          <p v-if="tokenSaved" class="eu-settings__ok" role="status">Token gespeichert.</p>
          <p v-if="updateError" class="eu-settings__error" role="alert">{{ updateError }}</p>
        </form>
      </EuCollapsibleSection>

      <EuCollapsibleSection title="E-Mail-Versand">
        <template #status>
          <EuBadge
            v-if="mailStatus?.lastSendResult"
            :tone="mailStatus.lastSendResult === 'ok' ? 'done' : 'open'"
            :icon="mailStatus.lastSendResult === 'ok' ? faCircleCheck : faCircleExclamation"
          >
            {{
              mailStatus.lastSendResult === 'ok'
                ? `Letzter Versand erfolgreich (${germanDateTime(mailStatus.lastSendAt)})`
                : `Letzter Versand fehlgeschlagen (${germanDateTime(mailStatus.lastSendAt)})`
            }}
          </EuBadge>
          <EuBadge v-else tone="neutral">Noch nichts versendet</EuBadge>
        </template>

        <form class="eu-settings__form" @submit.prevent="saveMail">
          <EuToggle v-model="mail.enabled" :label="settingLabel('mail.enabled')" />

          <div class="eu-settings__grid">
            <EuTextField v-model="mail.host" :label="settingLabel('mail.host')" />
            <EuTextField
              v-model="mail.port"
              :label="settingLabel('mail.port')"
              :error="portError"
              type="text"
            />
          </div>

          <EuToggle v-model="mail.secure" :label="settingLabel('mail.secure')" />
          <p class="eu-settings__hint">
            Für Port 465 einschalten, für 587 mit STARTTLS ausgeschaltet lassen.
          </p>

          <div class="eu-settings__grid">
            <EuTextField v-model="mail.user" :label="settingLabel('mail.user')" />
            <div>
              <EuTextField
                v-model="mail.password"
                type="password"
                :label="settingLabel('mail.password')"
              />
              <p class="eu-settings__hint">
                {{
                  passwordStored
                    ? 'Ein Passwort ist hinterlegt. Das Feld bleibt leer — eine Eingabe ersetzt es.'
                    : 'Leer lassen, wenn der Mailserver keine Anmeldung verlangt.'
                }}
              </p>
            </div>
          </div>

          <div class="eu-settings__grid">
            <EuTextField v-model="mail.fromAddress" :label="settingLabel('mail.fromAddress')" />
            <EuTextField v-model="mail.fromName" :label="settingLabel('mail.fromName')" />
          </div>

          <div class="eu-settings__actions">
            <EuButton type="submit" :disabled="mailBusy || Boolean(portError)">Speichern</EuButton>
            <EuButton
              v-if="passwordStored"
              variant="ghost"
              :icon="faTrash"
              :disabled="mailBusy"
              @click="clearPassword"
            >
              Passwort entfernen
            </EuButton>
            <EuButton
              variant="secondary"
              :icon="faPaperPlane"
              :disabled="testBusy || mailBusy"
              @click="runTest"
            >
              Testmail an mich senden
            </EuButton>
          </div>

          <p v-if="mailSaved" class="eu-settings__ok" role="status">Einstellungen gespeichert.</p>
          <p v-if="testResult" class="eu-settings__ok" role="status">{{ testResult }}</p>
          <p v-if="mailError" class="eu-settings__error" role="alert">{{ mailError }}</p>
          <p
            v-if="mailStatus?.lastSendResult === 'error' && mailStatus.lastSendError"
            class="eu-settings__hint"
          >
            Meldung des Mailservers beim letzten Versuch: {{ mailStatus.lastSendError }}
          </p>
        </form>
      </EuCollapsibleSection>
    </template>
  </div>
</template>

<style scoped>
.eu-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-settings__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}

.eu-settings__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
  width: 100%;
  max-width: 44rem;
}

.eu-settings__grid > * {
  min-width: 0;
}

.eu-settings__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
  margin: 0 0 1rem;
  font-family: var(--eu-font-data);
}

.eu-settings__facts dt {
  color: var(--eu-color-text-muted);
}

.eu-settings__facts dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.eu-settings__sentence,
.eu-settings__hint,
.eu-settings__ok,
.eu-settings__error {
  margin: 0;
  font-family: var(--eu-font-data);
  max-width: 44rem;
}

.eu-settings__hint {
  font-size: 0.875rem;
  color: var(--eu-color-text-muted);
}

.eu-settings__ok {
  color: var(--eu-color-status-done-fg);
}

.eu-settings__error {
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  padding: 0.6em 0.9em;
  border-radius: 0.375em;
  background-color: var(--eu-color-error-bg);
  color: var(--eu-color-error-fg);
}

.eu-settings__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.eu-settings__link {
  color: var(--eu-color-accent-text);
}

/* The dialogs' rule (Slice 29): a value column of its own on the phone. */
@media (max-width: 30rem) {
  .eu-settings__facts {
    grid-template-columns: 1fr;
    gap: 0.1rem 0;
  }

  .eu-settings__facts dd {
    margin-bottom: 0.5rem;
  }
}
</style>
