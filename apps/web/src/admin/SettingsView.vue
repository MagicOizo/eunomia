<script setup lang="ts">
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { describeError } from '../lib/errors';
import GeneralSection from './GeneralSection.vue';
import MailSection from './MailSection.vue';
import ReminderSection from './ReminderSection.vue';
import RetentionSection from './RetentionSection.vue';
import UpdateSection from './UpdateSection.vue';
import { type SettingsSnapshot, loadSettings } from './settings-api';

/**
 * System settings (Slice 30, extended in Slice 31, Scheibe 18 and Slice 83). The first
 * area of the admin section. This file holds only what the sections share:
 * the snapshot they are filled from, and the notice that secrets cannot be
 * stored at all.
 *
 * Each section writes its own keys and hands back the snapshot the API answered
 * with, so the one below always sees what the one above just saved — the mail
 * dispatch being off is something the reminders have to say (CR-30).
 */
const { t } = useI18n();

const loading = ref(true);
const loadError = ref<string | null>(null);
const snapshot = ref<SettingsSnapshot | null>(null);

const encryptionAvailable = computed(() => snapshot.value?.encryptionAvailable !== false);

onMounted(async () => {
  try {
    snapshot.value = await loadSettings();
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="eu-settings">
    <!-- No heading of its own: AppHeader already renders the route title as the
         page's h1, and the sections below are its h2s (like BillingsView). -->
    <p v-if="loading" class="eu-settings__hint">{{ t('settings.loading') }}</p>
    <p v-else-if="loadError" class="eu-settings__error" role="alert">{{ loadError }}</p>

    <template v-else-if="snapshot">
      <p v-if="!encryptionAvailable" class="eu-settings__error" role="alert">
        <FontAwesomeIcon :icon="faCircleExclamation" aria-hidden="true" />
        <i18n-t keypath="settings.encryptionMissing" scope="global">
          <template #key><code>CONFIG_ENCRYPTION_KEY</code></template>
        </i18n-t>
      </p>

      <GeneralSection :snapshot="snapshot" @snapshot="snapshot = $event" />
      <UpdateSection :snapshot="snapshot" @snapshot="snapshot = $event" />
      <MailSection :snapshot="snapshot" @snapshot="snapshot = $event" />
      <ReminderSection :snapshot="snapshot" @snapshot="snapshot = $event" />
      <RetentionSection :snapshot="snapshot" @snapshot="snapshot = $event" />
    </template>
  </div>
</template>

<style src="./settings.css"></style>
