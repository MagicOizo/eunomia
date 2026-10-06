<script setup lang="ts">
import {
  faCircleCheck,
  faCircleExclamation,
  faEye,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { useDialogAction } from '../lib/dialog-action';
import { settingLabel } from '../lib/field-labels';
import { formatDateTime, plural } from '../lib/format';
import { boolOf, statusOf, stringOf } from './settings-values';
import {
  type RetentionRunResult,
  type SettingsSnapshot,
  loadSettings,
  runRetention,
  saveSettings,
} from './settings-api';

/**
 * The retention period (Scheibe 18, SEC-15): after how many days a record in
 * the Papierkorb — and a deleted user — goes for good, plus a dry run that says
 * what that would be right now.
 *
 * The switch is off until someone turns it on, and the page says plainly that
 * the sweep cannot be undone. That is the whole reason the dry run exists.
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();

/** The editable form. The number is held as text, like the mail port. */
const retention = reactive({ enabled: false, trashDays: '90' });
const saved = ref(false);
const lastRun = ref<RetentionRunResult | null>(null);

const action = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    retention.enabled = boolOf(snapshot, 'retention.enabled');
    retention.trashDays = stringOf(snapshot, 'retention.trashDays', '90');
  },
  { immediate: true },
);

const daysError = computed(() => {
  const parsed = Number(retention.trashDays);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650
    ? undefined
    : 'Bitte eine Zahl zwischen 1 und 3650 angeben.';
});

const status = computed(() => ({
  lastRunAt: statusOf(props.snapshot, 'retention.lastRunAt') as string | null,
  lastRunResult: statusOf(props.snapshot, 'retention.lastRunResult') as 'ok' | 'error' | null,
  lastRunError: statusOf(props.snapshot, 'retention.lastRunError') as string | null,
  lastRunPurged: statusOf(props.snapshot, 'retention.lastRunPurged') as number | null,
}));

async function saveRetention(): Promise<void> {
  if (daysError.value) return;
  saved.value = false;
  lastRun.value = null;
  await action.run(async () => {
    emit(
      'snapshot',
      await saveSettings({
        'retention.enabled': retention.enabled,
        'retention.trashDays': Number(retention.trashDays),
      }),
    );
    saved.value = true;
  });
}

/**
 * Sweeps by hand. A dry run counts; a real run deletes — and its result belongs
 * in the status, so the snapshot is reloaded either way.
 */
async function runNow(dryRun: boolean): Promise<void> {
  lastRun.value = null;
  saved.value = false;
  await action.run(async () => {
    try {
      lastRun.value = await runRetention(dryRun);
    } finally {
      // Inside the action, so the buttons stay disabled until the status is
      // back — and its own failure stays quiet: the run is what was asked for.
      try {
        emit('snapshot', await loadSettings());
      } catch {
        /* the message above is what matters */
      }
    }
  });
}

/** What the last manual sweep did, in one sentence. */
const runSentence = computed(() => {
  const result = lastRun.value;
  if (!result) return null;
  const records = plural(result.purged, 'Eintrag', 'Einträge');
  const users =
    result.users === 0
      ? ''
      : ` und ${plural(result.users, 'gelöschter Nutzer', 'gelöschte Nutzer')}`;
  const held =
    result.skipped === 0
      ? ''
      : ` ${plural(result.skipped, 'Eintrag', 'Einträge')} ${
          result.skipped === 1 ? 'bleibt' : 'bleiben'
        } noch: dort hängt etwas Aktives daran.`;
  const age = `älter als ${plural(result.days, 'Tag', 'Tage')}`;
  if (result.dryRun) {
    return `Probelauf: ${records}${users} ${age} würden endgültig gelöscht.${held} Es wurde nichts gelöscht.`;
  }
  return `${records}${users} endgültig gelöscht.${held}`;
});

/**
 * The kinds a run touched, one line each, so the sentence above can be checked
 * against them. A kind where nothing could go reads as what stays, not as
 * "0 Leistungserbringer".
 */
const runDetail = computed(() =>
  (lastRun.value?.byKind ?? [])
    .filter((entry) => entry.purged + entry.skipped > 0)
    .map((entry) => {
      const name = (count: number): string => plural(count, entry.singular, entry.plural);
      const parts = [
        ...(entry.purged > 0 ? [name(entry.purged)] : []),
        ...(entry.skipped > 0
          ? [`${name(entry.skipped)} ${entry.skipped === 1 ? 'bleibt' : 'bleiben'} noch`]
          : []),
      ];
      return { kind: entry.kind, text: parts.join(' — ') };
    }),
);
</script>

<template>
  <EuCollapsibleSection title="Aufbewahrung">
    <template #status>
      <EuBadge
        v-if="status.lastRunResult"
        :tone="status.lastRunResult === 'ok' ? 'done' : 'open'"
        :icon="status.lastRunResult === 'ok' ? faCircleCheck : faCircleExclamation"
      >
        {{
          `Letzter Lauf ${formatDateTime(status.lastRunAt)}` +
          (status.lastRunResult === 'ok'
            ? ` — ${status.lastRunPurged ?? 0} entfernt`
            : ' — fehlgeschlagen')
        }}
      </EuBadge>
      <EuBadge v-else tone="neutral">Noch nicht gelaufen</EuBadge>
    </template>

    <form class="eu-settings__form" @submit.prevent="saveRetention">
      <p class="eu-settings__hint">
        Gelöschte Datensätze bleiben im Papierkorb, bis jemand sie dort endgültig entfernt. Mit
        einer Frist tut Eunomia das selbst: Was länger als die eingestellte Zahl von Tagen im
        Papierkorb liegt, wird einmal täglich endgültig gelöscht — und mit ihm, was darunter hängt
        und selbst gelöscht ist. Gelöschte Nutzer gehen nach derselben Frist. Das ist nicht
        umkehrbar; der Probelauf zeigt vorher, was es trifft.
      </p>

      <EuToggle v-model="retention.enabled" :label="settingLabel('retention.enabled')" />

      <div class="eu-settings__grid">
        <EuTextField
          v-model="retention.trashDays"
          :label="settingLabel('retention.trashDays')"
          :error="daysError"
          type="text"
        />
      </div>
      <p class="eu-settings__hint">
        Einträge aus der Zeit vor dem Papierkorb haben kein Löschdatum und werden von der Frist nie
        erfasst — die bleiben von Hand zu löschen.
      </p>

      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy || Boolean(daysError)">Speichern</EuButton>
        <EuButton variant="secondary" :icon="faEye" :disabled="action.busy" @click="runNow(true)">
          Probelauf
        </EuButton>
        <EuButton
          variant="secondary"
          :icon="faTrash"
          :disabled="action.busy || !retention.enabled"
          @click="runNow(false)"
        >
          Jetzt aufräumen
        </EuButton>
      </div>

      <p v-if="saved" class="eu-settings__ok" role="status">Einstellungen gespeichert.</p>
      <p v-if="runSentence" class="eu-settings__ok" role="status">{{ runSentence }}</p>
      <p v-if="action.error" class="eu-settings__error" role="alert">{{ action.error }}</p>
      <p v-if="status.lastRunResult === 'error' && status.lastRunError" class="eu-settings__hint">
        Meldung beim letzten Lauf: {{ status.lastRunError }}
      </p>

      <ul v-if="runDetail.length > 0" class="eu-settings__list">
        <li v-for="entry in runDetail" :key="entry.kind">{{ entry.text }}</li>
      </ul>
    </form>
  </EuCollapsibleSection>
</template>
