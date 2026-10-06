<script setup lang="ts">
import {
  faCircleCheck,
  faCircleExclamation,
  faPaperPlane,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { useDialogAction } from '../lib/dialog-action';
import { settingLabel } from '../lib/field-labels';
import { formatDateTime } from '../lib/format';
import { boolOf, isStored, stringOf } from './settings-values';
import {
  type SettingWrite,
  type SettingsSnapshot,
  loadSettings,
  saveSettings,
  sendTestMail,
} from './settings-api';

/**
 * The SMTP account the app sends through, with a test that proves it works and
 * a status that survives a restart. Everything the reminders need to go out —
 * which is why the reminder section watches the switch at the top of this form.
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();
const { t } = useI18n();

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
const saved = ref(false);
const testResult = ref<string | null>(null);

const action = useDialogAction();
const test = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    mail.enabled = boolOf(snapshot, 'mail.enabled');
    mail.host = stringOf(snapshot, 'mail.host');
    mail.port = stringOf(snapshot, 'mail.port', '587');
    mail.secure = boolOf(snapshot, 'mail.secure');
    mail.user = stringOf(snapshot, 'mail.user');
    mail.fromAddress = stringOf(snapshot, 'mail.fromAddress');
    mail.fromName = stringOf(snapshot, 'mail.fromName');
    mail.password = '';
    passwordStored.value = isStored(snapshot, 'mail.password');
  },
  { immediate: true },
);

const mailStatus = computed(() => props.snapshot.mailStatus);

const portError = computed(() => {
  if (mail.port.trim() === '') return undefined;
  const parsed = Number(mail.port);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
    ? undefined
    : t('settings.mail.portError');
});

async function saveMail(): Promise<void> {
  if (portError.value) return;
  saved.value = false;
  // Only ever one of the two complaints stands at a time, so the form shows
  // whichever is set (the template reads them in one line).
  test.clear();
  await action.run(async () => {
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
    emit('snapshot', await saveSettings(values));
    saved.value = true;
  });
}

async function clearPassword(): Promise<void> {
  saved.value = false;
  test.clear();
  await action.run(async () => {
    emit('snapshot', await saveSettings({ 'mail.password': null }));
  });
}

async function runTest(): Promise<void> {
  testResult.value = null;
  action.clear();
  await test.run(async () => {
    try {
      const { recipient } = await sendTestMail();
      testResult.value = t('settings.mail.testSent', { recipient });
    } finally {
      // The attempt is part of the status now — the failed one too, which is
      // why this runs either way, inside the action so the button stays
      // disabled until the status is back.
      try {
        emit('snapshot', await loadSettings());
      } catch {
        /* the message above is what matters */
      }
    }
  });
}
</script>

<template>
  <EuCollapsibleSection :title="t('settings.mail.title')">
    <template #status>
      <EuBadge
        v-if="mailStatus?.lastSendResult"
        :tone="mailStatus.lastSendResult === 'ok' ? 'done' : 'open'"
        :icon="mailStatus.lastSendResult === 'ok' ? faCircleCheck : faCircleExclamation"
      >
        {{
          mailStatus.lastSendResult === 'ok'
            ? t('settings.mail.lastSendOk', { at: formatDateTime(mailStatus.lastSendAt) })
            : t('settings.mail.lastSendFailed', { at: formatDateTime(mailStatus.lastSendAt) })
        }}
      </EuBadge>
      <EuBadge v-else tone="neutral">{{ t('settings.mail.nothingSent') }}</EuBadge>
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
      <p class="eu-settings__hint">{{ t('settings.mail.secureHint') }}</p>

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
                ? t('settings.mail.passwordStored')
                : t('settings.mail.passwordOptional')
            }}
          </p>
        </div>
      </div>

      <div class="eu-settings__grid">
        <EuTextField v-model="mail.fromAddress" :label="settingLabel('mail.fromAddress')" />
        <EuTextField v-model="mail.fromName" :label="settingLabel('mail.fromName')" />
      </div>

      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy || Boolean(portError)">{{
          t('common.save')
        }}</EuButton>
        <EuButton
          v-if="passwordStored"
          variant="ghost"
          :icon="faTrash"
          :disabled="action.busy"
          @click="clearPassword"
        >
          {{ t('settings.mail.removePassword') }}
        </EuButton>
        <EuButton
          variant="secondary"
          :icon="faPaperPlane"
          :disabled="test.busy || action.busy"
          @click="runTest"
        >
          {{ t('settings.mail.sendTest') }}
        </EuButton>
      </div>

      <p v-if="saved" class="eu-settings__ok" role="status">{{ t('settings.saved') }}</p>
      <p v-if="testResult" class="eu-settings__ok" role="status">{{ testResult }}</p>
      <p v-if="action.error ?? test.error" class="eu-settings__error" role="alert">
        {{ action.error ?? test.error }}
      </p>
      <p
        v-if="mailStatus?.lastSendResult === 'error' && mailStatus.lastSendError"
        class="eu-settings__hint"
      >
        {{ t('settings.mail.serverMessage', { message: mailStatus.lastSendError }) }}
      </p>
    </form>
  </EuCollapsibleSection>
</template>
