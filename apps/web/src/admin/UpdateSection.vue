<script setup lang="ts">
import { faCircleCheck, faCircleInfo, faRotate, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useDialogAction } from '../lib/dialog-action';
import { describeError } from '../lib/errors';
import { settingLabel } from '../lib/field-labels';
import { formatDateTime } from '../lib/format';
import { loadUpdateStatus, refreshUpdateStatus, updateStatus } from '../lib/update-status';
import { isStored } from './settings-values';
import { type SettingsSnapshot, saveSettings } from './settings-api';

/**
 * Which version runs, whether a newer one is published, and the GitHub token a
 * private instance needs to find out. The answer itself is shared with the
 * footer's notice, so it comes from lib/update-status.ts rather than from the
 * settings snapshot — the button here asks GitHub again for both.
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();
const { t } = useI18n();

const update = updateStatus;
const token = ref('');
const tokenStored = ref(false);
const tokenSaved = ref(false);

const action = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    // The field stays empty: an entry replaces the stored token, nothing else.
    token.value = '';
    tokenStored.value = isStored(snapshot, 'updateCheck.token');
  },
  { immediate: true },
);

// Separate request, separate failure: a GitHub hiccup must not hide the
// settings form, so the page loads the snapshot and this section the status.
void loadUpdateStatus().catch((error: unknown) => {
  action.error = describeError(error);
});

async function saveToken(): Promise<void> {
  // An empty field means "leave the stored token alone". Submitting it would
  // send '', which the API reads as "clear this secret" — pressing Enter in the
  // empty field would silently delete the token. Removing it is the explicit
  // button next to this one.
  if (token.value === '') return;
  tokenSaved.value = false;
  await action.run(async () => {
    emit('snapshot', await saveSettings({ 'updateCheck.token': token.value }));
    tokenSaved.value = true;
    // A fresh token deserves a fresh answer instead of the cached failure; that
    // it may fail says nothing about the token, which is stored by now.
    await refreshUpdateStatus();
  });
}

async function clearToken(): Promise<void> {
  tokenSaved.value = false;
  await action.run(async () => {
    emit('snapshot', await saveSettings({ 'updateCheck.token': null }));
    await refreshUpdateStatus();
  });
}

async function checkNow(): Promise<void> {
  await action.run(refreshUpdateStatus);
}

/** The state of the update check in words — the footer can only stay silent. */
const updateSentence = computed(() => {
  const status = update.value;
  if (!status) return t('settings.update.status.notQueried');
  if (status.status === 'disabled') return t('settings.update.status.disabled');
  if (status.status === 'unavailable') {
    switch (status.reason) {
      case 'no_token_private':
        return t('settings.update.status.noTokenPrivate');
      case 'not_found':
        return t('settings.update.status.notFound');
      case 'unauthorized':
        return t('settings.update.status.unauthorized');
      case 'rate_limited':
        return t('settings.update.status.rateLimited');
      case 'no_release':
        return t('settings.update.status.noRelease');
      default:
        return t('settings.update.status.unreachable');
    }
  }
  if (status.updateAvailable) {
    return t('settings.update.status.available', { version: status.latest ?? '' });
  }
  return t('settings.update.status.upToDate');
});

const updateTone = computed<'done' | 'submitted' | 'neutral'>(() => {
  const status = update.value;
  if (!status || status.status !== 'ok') return 'neutral';
  return status.updateAvailable ? 'submitted' : 'done';
});
</script>

<template>
  <EuCollapsibleSection :title="t('settings.update.title')">
    <template #status>
      <EuBadge :tone="updateTone">
        {{ update?.current ? `v${update.current}` : t('settings.update.versionUnknown') }}
      </EuBadge>
    </template>

    <dl class="eu-settings__facts">
      <dt>{{ t('settings.update.running') }}</dt>
      <dd>{{ update?.current ?? '–' }}</dd>
      <dt>{{ t('settings.update.latest') }}</dt>
      <dd>{{ update?.latest ?? '–' }}</dd>
      <dt>{{ t('settings.update.checkedAt') }}</dt>
      <dd>
        {{ update?.checkedAt ? formatDateTime(update.checkedAt) : t('settings.update.notYet') }}
      </dd>
    </dl>

    <p class="eu-settings__sentence">
      <FontAwesomeIcon
        :icon="update?.status === 'ok' ? faCircleCheck : faCircleInfo"
        aria-hidden="true"
      />
      {{ updateSentence }}
    </p>

    <div class="eu-settings__actions">
      <EuButton variant="secondary" :icon="faRotate" :disabled="action.busy" @click="checkNow">
        {{ t('settings.update.checkNow') }}
      </EuButton>
      <a
        v-if="update?.releaseUrl"
        class="eu-settings__link"
        :href="update.releaseUrl"
        target="_blank"
        rel="noreferrer noopener"
      >
        {{ t('settings.update.releaseNotes') }}
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
        {{ tokenStored ? t('settings.update.tokenStored') : t('settings.update.tokenMissing') }}
      </p>
      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy || token === ''">{{
          t('settings.update.saveToken')
        }}</EuButton>
        <EuButton
          v-if="tokenStored"
          variant="ghost"
          :icon="faTrash"
          :disabled="action.busy"
          @click="clearToken"
        >
          {{ t('settings.update.removeToken') }}
        </EuButton>
      </div>
      <p v-if="tokenSaved" class="eu-settings__ok" role="status">
        {{ t('settings.update.tokenSaved') }}
      </p>
      <p v-if="action.error" class="eu-settings__error" role="alert">{{ action.error }}</p>
    </form>
  </EuCollapsibleSection>
</template>
