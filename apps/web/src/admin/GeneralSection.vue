<script setup lang="ts">
import { isFormatRegion, isLocale } from '@eunomia/shared';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EuSelectField from '../components/resource/EuSelectField.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import { useDialogAction } from '../lib/dialog-action';
import { settingLabel } from '../lib/field-labels';
import { formatOptions, languageOptions } from '../lib/locale-options';
import { loadInstanceDefaults } from '../lib/locale-preferences';
import { stringOf } from './settings-values';
import { type SettingsSnapshot, saveSettings } from './settings-api';

/**
 * The instance's language and format (Slice 83): what everyone sees who has
 * chosen neither in the profile and whose browser speaks no language Eunomia
 * does, and what their mails are written in.
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();
const { t } = useI18n();

/** `''` in the format select means "from the language". */
const general = reactive({ locale: 'de', format: '' });
const saved = ref(false);

const action = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    general.locale = stringOf(snapshot, 'general.defaultLocale', 'de');
    general.format = stringOf(snapshot, 'general.defaultFormat');
  },
  { immediate: true },
);

// Computed, so the format names follow a change of language.
const localeOptions = computed(() => languageOptions());
const regionOptions = computed(() => formatOptions());

async function saveGeneral(): Promise<void> {
  saved.value = false;
  await action.run(async () => {
    emit(
      'snapshot',
      await saveSettings({
        // An empty language falls back to German on the server, too.
        'general.defaultLocale': isLocale(general.locale) ? general.locale : null,
        'general.defaultFormat': isFormatRegion(general.format) ? general.format : null,
      }),
    );
    saved.value = true;
    // Whoever follows the instance — the admin included — switches now.
    await loadInstanceDefaults();
  });
}
</script>

<template>
  <EuCollapsibleSection :title="t('settings.general.title')">
    <form class="eu-settings__form" @submit.prevent="saveGeneral">
      <p class="eu-settings__hint">{{ t('settings.general.lead') }}</p>

      <div class="eu-settings__grid">
        <EuSelectField
          v-model="general.locale"
          :label="settingLabel('general.defaultLocale')"
          :options="localeOptions"
          required
        />
        <EuSelectField
          v-model="general.format"
          :label="settingLabel('general.defaultFormat')"
          :options="regionOptions"
          :empty-label="t('settings.general.fromLanguage')"
        />
      </div>

      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy">{{ t('common.save') }}</EuButton>
      </div>
      <p v-if="saved" class="eu-settings__ok" role="status">{{ t('settings.saved') }}</p>
      <p v-if="action.error" class="eu-settings__error" role="alert">{{ action.error }}</p>
    </form>
  </EuCollapsibleSection>
</template>
