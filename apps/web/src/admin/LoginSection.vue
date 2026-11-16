<script setup lang="ts">
import { isOidcIssuer, oidcRedirectUri } from '@eunomia/shared';
import {
  faCircleCheck,
  faCircleExclamation,
  faCopy,
  faPlug,
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
import { oidcTestCause } from '../lib/oidc-test-text';
import { boolOf, isStored, statusOf, stringOf } from './settings-values';
import {
  type SettingWrite,
  type SettingsSnapshot,
  loadSettings,
  saveSettings,
  testLoginConnection,
} from './settings-api';

/**
 * Sign-in through an OpenID Connect provider (Slice 87): the provider's
 * address and client, a test that proves the provider can be verified, and
 * the redirect URI to register there. Built like the mail section — the test
 * runs against what is stored, so it stays locked while the form holds
 * changes that are not saved yet (an author's decision: a green result must
 * never stand for a configuration other than the one on screen).
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();
const { t } = useI18n();

/** The longest button label the API accepts (registry: `login.oidcButtonLabel`). */
const BUTTON_LABEL_MAX = 50;

/** The editable form, filled from the snapshot on load. */
const login = reactive({
  enabled: false,
  issuer: '',
  clientId: '',
  buttonLabel: '',
  /** Empty means "leave the stored secret alone". */
  clientSecret: '',
});
/** What the snapshot filled the form with — the yardstick for unsaved changes. */
const stored = reactive({ enabled: false, issuer: '', clientId: '', buttonLabel: '' });
const secretStored = ref(false);
const saved = ref(false);
const testDone = ref(false);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const uriElement = ref<HTMLElement | null>(null);

const action = useDialogAction();
const test = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    stored.enabled = boolOf(snapshot, 'login.oidcEnabled');
    stored.issuer = stringOf(snapshot, 'login.oidcIssuer');
    stored.clientId = stringOf(snapshot, 'login.oidcClientId');
    stored.buttonLabel = stringOf(snapshot, 'login.oidcButtonLabel');
    Object.assign(login, stored, { clientSecret: '' });
    secretStored.value = isStored(snapshot, 'login.oidcClientSecret');
  },
  { immediate: true },
);

const dirty = computed(
  () =>
    login.enabled !== stored.enabled ||
    login.issuer.trim() !== stored.issuer ||
    login.clientId.trim() !== stored.clientId ||
    login.buttonLabel.trim() !== stored.buttonLabel ||
    login.clientSecret !== '',
);

const issuerError = computed(() =>
  login.issuer.trim() === '' || isOidcIssuer(login.issuer.trim())
    ? undefined
    : t('settings.login.issuerError'),
);
const buttonLabelError = computed(() =>
  login.buttonLabel.trim().length > BUTTON_LABEL_MAX
    ? t('settings.login.buttonLabelError', { max: BUTTON_LABEL_MAX })
    : undefined,
);
const formInvalid = computed(() => Boolean(issuerError.value ?? buttonLabelError.value));

const lastTest = computed(() => {
  const result = statusOf(props.snapshot, 'login.oidcLastTestResult');
  return {
    at: statusOf(props.snapshot, 'login.oidcLastTestAt'),
    result: result === 'ok' || result === 'error' ? result : null,
    cause: statusOf(props.snapshot, 'login.oidcLastTestError'),
    detail: statusOf(props.snapshot, 'login.oidcLastTestDetail'),
  };
});

/** Built from the stored instance address, never the browser's: the provider compares it. */
const redirectUri = computed(() => {
  const appUrl = stringOf(props.snapshot, 'general.appUrl').trim();
  return appUrl === '' ? null : oidcRedirectUri(appUrl);
});

function resetMessages(): void {
  saved.value = false;
  testDone.value = false;
  action.clear();
  test.clear();
}

async function saveLogin(): Promise<void> {
  if (formInvalid.value) return;
  resetMessages();
  await action.run(async () => {
    const values: SettingWrite = {
      'login.oidcEnabled': login.enabled,
      // Empty clears it on the server, like every text setting.
      'login.oidcIssuer': login.issuer.trim(),
      'login.oidcClientId': login.clientId.trim(),
      'login.oidcButtonLabel': login.buttonLabel.trim(),
    };
    // Only send the secret when one was typed — an untouched field must not
    // overwrite what is stored (CR-34, as with the mail password).
    if (login.clientSecret !== '') values['login.oidcClientSecret'] = login.clientSecret;
    emit('snapshot', await saveSettings(values));
    saved.value = true;
  });
}

async function clearSecret(): Promise<void> {
  resetMessages();
  await action.run(async () => {
    emit('snapshot', await saveSettings({ 'login.oidcClientSecret': null }));
  });
}

async function runTest(): Promise<void> {
  resetMessages();
  await test.run(async () => {
    try {
      await testLoginConnection();
      testDone.value = true;
    } finally {
      // The recorded status is what the section shows; reload it either way,
      // inside the action so the button stays disabled until it is back.
      try {
        emit('snapshot', await loadSettings());
      } catch {
        /* the message above is what matters */
      }
    }
  });
}

/**
 * Copies the redirect URI. The clipboard API exists only in a secure context
 * and may be refused; then the line is selected so a Ctrl+C takes it.
 */
async function copyRedirectUri(): Promise<void> {
  if (redirectUri.value === null) return;
  try {
    if (!navigator.clipboard) throw new Error('no clipboard');
    await navigator.clipboard.writeText(redirectUri.value);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
    const element = uriElement.value;
    const selection = window.getSelection();
    if (element && selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

watch(redirectUri, () => {
  copyState.value = 'idle';
});
</script>

<template>
  <EuCollapsibleSection :title="t('settings.login.title')">
    <template #status>
      <EuBadge
        v-if="lastTest.result"
        :tone="lastTest.result === 'ok' ? 'done' : 'open'"
        :icon="lastTest.result === 'ok' ? faCircleCheck : faCircleExclamation"
      >
        {{
          lastTest.result === 'ok'
            ? t('settings.login.lastTestOk', { at: formatDateTime(lastTest.at) })
            : t('settings.login.lastTestFailed', { at: formatDateTime(lastTest.at) })
        }}
      </EuBadge>
      <EuBadge v-else tone="neutral">{{ t('settings.login.notTested') }}</EuBadge>
    </template>

    <form class="eu-settings__form" @submit.prevent="saveLogin">
      <p class="eu-settings__hint">{{ t('settings.login.lead') }}</p>

      <div class="eu-settings__uri">
        <span class="eu-settings__uri-label">{{ t('settings.login.redirectUri') }}</span>
        <template v-if="redirectUri">
          <code ref="uriElement" class="eu-settings__uri-value">{{ redirectUri }}</code>
          <EuButton variant="secondary" :icon="faCopy" @click="copyRedirectUri">
            {{ t('settings.login.copy') }}
          </EuButton>
        </template>
        <p v-else class="eu-settings__hint">{{ t('settings.login.redirectUriMissing') }}</p>
      </div>
      <p v-if="copyState === 'copied'" class="eu-settings__ok" role="status">
        {{ t('settings.login.copied') }}
      </p>
      <p v-else-if="copyState === 'failed'" class="eu-settings__hint" role="status">
        {{ t('settings.login.copyFailed') }}
      </p>

      <EuToggle v-model="login.enabled" :label="settingLabel('login.oidcEnabled')" />

      <div class="eu-settings__grid">
        <div>
          <EuTextField
            v-model="login.issuer"
            :label="settingLabel('login.oidcIssuer')"
            :error="issuerError"
            type="text"
          />
          <p class="eu-settings__hint">{{ t('settings.login.issuerHint') }}</p>
        </div>
        <EuTextField v-model="login.clientId" :label="settingLabel('login.oidcClientId')" />
      </div>

      <div class="eu-settings__grid">
        <div>
          <EuTextField
            v-model="login.clientSecret"
            type="password"
            :label="settingLabel('login.oidcClientSecret')"
          />
          <p class="eu-settings__hint">
            {{
              secretStored ? t('settings.login.secretStored') : t('settings.login.secretMissing')
            }}
          </p>
        </div>
        <div>
          <EuTextField
            v-model="login.buttonLabel"
            :label="settingLabel('login.oidcButtonLabel')"
            :error="buttonLabelError"
          />
          <p class="eu-settings__hint">{{ t('settings.login.buttonLabelHint') }}</p>
        </div>
      </div>

      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy || formInvalid">{{
          t('common.save')
        }}</EuButton>
        <EuButton
          v-if="secretStored"
          variant="ghost"
          :icon="faTrash"
          :disabled="action.busy"
          @click="clearSecret"
        >
          {{ t('settings.login.removeSecret') }}
        </EuButton>
        <EuButton
          variant="secondary"
          :icon="faPlug"
          :disabled="dirty || test.busy || action.busy"
          @click="runTest"
        >
          {{ t('settings.login.test') }}
        </EuButton>
        <span v-if="dirty" class="eu-settings__hint">{{ t('settings.login.saveFirst') }}</span>
      </div>

      <p v-if="saved" class="eu-settings__ok" role="status">{{ t('settings.saved') }}</p>
      <p v-if="testDone && lastTest.result === 'ok'" class="eu-settings__ok" role="status">
        {{ t('settings.login.testOk') }}
      </p>
      <p v-if="action.error ?? test.error" class="eu-settings__error" role="alert">
        {{ action.error ?? test.error }}
      </p>
      <template v-if="lastTest.result === 'error'">
        <p class="eu-settings__sentence" :role="testDone ? 'alert' : undefined">
          {{ oidcTestCause(lastTest.cause) }}
        </p>
        <p v-if="lastTest.detail" class="eu-settings__hint">
          {{ t('settings.login.detail', { detail: lastTest.detail }) }}
        </p>
      </template>
    </form>
  </EuCollapsibleSection>
</template>
