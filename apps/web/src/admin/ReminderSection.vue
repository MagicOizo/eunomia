<script setup lang="ts">
import {
  faBell,
  faCircleCheck,
  faCircleExclamation,
  faEye,
} from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { useDialogAction } from '../lib/dialog-action';
import { settingLabel } from '../lib/field-labels';
import { formatDateTime } from '../lib/format';
import { boolOf, statusOf, stringOf } from './settings-values';
import {
  type ReminderRunResult,
  type SettingsSnapshot,
  loadSettings,
  runReminders,
  saveSettings,
} from './settings-api';

/**
 * The payment reminders that go out on their own: when they run, how often an
 * overdue invoice is repeated, and a manual run — as a preview of what would be
 * sent, or for real.
 */
const props = defineProps<{ snapshot: SettingsSnapshot }>();
const emit = defineEmits<{ snapshot: [SettingsSnapshot] }>();

/** The editable reminder form. Numbers are held as text, like the mail port. */
const reminders = reactive({
  enabled: false,
  hour: '7',
  timeZone: '',
  repeatDays: '7',
  appUrl: '',
});
const saved = ref(false);
const lastRun = ref<ReminderRunResult | null>(null);

const action = useDialogAction();

watch(
  () => props.snapshot,
  (snapshot) => {
    reminders.enabled = boolOf(snapshot, 'reminders.enabled');
    reminders.hour = stringOf(snapshot, 'reminders.hour', '7');
    reminders.timeZone = stringOf(snapshot, 'reminders.timeZone', 'Europe/Berlin');
    reminders.repeatDays = stringOf(snapshot, 'reminders.repeatDays', '7');
    reminders.appUrl = stringOf(snapshot, 'reminders.appUrl');
  },
  { immediate: true },
);

/** Without the mail dispatch nothing can go out — said here, where it matters. */
const mailEnabled = computed(() => boolOf(props.snapshot, 'mail.enabled'));

const hourError = computed(() => {
  const parsed = Number(reminders.hour);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? undefined
    : 'Bitte eine volle Stunde zwischen 0 und 23 angeben.';
});

const repeatError = computed(() => {
  const parsed = Number(reminders.repeatDays);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 90
    ? undefined
    : 'Bitte eine Zahl zwischen 1 und 90 angeben.';
});

const status = computed(() => ({
  lastRunAt: statusOf(props.snapshot, 'reminders.lastRunAt') as string | null,
  lastRunResult: statusOf(props.snapshot, 'reminders.lastRunResult') as 'ok' | 'error' | null,
  lastRunError: statusOf(props.snapshot, 'reminders.lastRunError') as string | null,
  lastRunSent: statusOf(props.snapshot, 'reminders.lastRunSent') as number | null,
}));

async function saveReminders(): Promise<void> {
  if (hourError.value || repeatError.value) return;
  saved.value = false;
  await action.run(async () => {
    emit(
      'snapshot',
      await saveSettings({
        'reminders.enabled': reminders.enabled,
        'reminders.hour': Number(reminders.hour),
        'reminders.timeZone': reminders.timeZone,
        'reminders.repeatDays': Number(reminders.repeatDays),
        'reminders.appUrl': reminders.appUrl,
      }),
    );
    saved.value = true;
  });
}

/**
 * Runs the reminders by hand. A dry run shows what would go out; a real run
 * sends it — and its result belongs in the status, so the snapshot is reloaded
 * either way.
 */
async function runNow(dryRun: boolean): Promise<void> {
  lastRun.value = null;
  await action.run(async () => {
    try {
      lastRun.value = await runReminders(dryRun);
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

/** German plural without a library: the forms these sentences need. */
function plural(n: number, singular: string, forms: string): string {
  const [one, many] = forms.split('|');
  return `${n} ${singular}${n === 1 ? one : many}`;
}

/** What the last manual run did, in one sentence. */
const runSentence = computed(() => {
  const result = lastRun.value;
  if (!result) return null;
  if (result.recipients === 0) {
    const checked = plural(result.invoices, 'offene Rechnung', '|en');
    return `Keine fälligen Zahlungen: ${checked} geprüft, niemand zu benachrichtigen.`;
  }
  if (result.dryRun) {
    const who = plural(result.recipients, 'Empfänger', '|');
    const verb = result.recipients === 1 ? 'würde' : 'würden';
    return `Vorschau: ${who} ${verb} eine Erinnerung bekommen. Es wurde nichts versendet.`;
  }
  const failed = result.failed > 0 ? `, ${result.failed} fehlgeschlagen` : '';
  return `${plural(result.sent, 'Erinnerung', '|en')} versendet${failed}.`;
});

/**
 * Why the preview shows fewer mails than there are recipients: the API withholds
 * a text whose invoices the viewer may not read. Said plainly, so a missing text
 * does not look like a bug.
 */
const hiddenSentence = computed(() => {
  const hidden = lastRun.value?.previewHidden ?? 0;
  if (hidden === 0) return null;
  const who = plural(hidden, 'Empfänger', '|');
  const verb = hidden === 1 ? 'wird' : 'werden';
  const whose = hidden === 1 ? 'dessen' : 'deren';
  return `${who} ${verb} nicht angezeigt: für ${whose} Rechnungen fehlt die Leseberechtigung.`;
});
</script>

<template>
  <EuCollapsibleSection title="Zahlungserinnerungen">
    <template #status>
      <EuBadge
        v-if="status.lastRunResult"
        :tone="status.lastRunResult === 'ok' ? 'done' : 'open'"
        :icon="status.lastRunResult === 'ok' ? faCircleCheck : faCircleExclamation"
      >
        {{
          `Letzter Lauf ${formatDateTime(status.lastRunAt)}` +
          (status.lastRunResult === 'ok'
            ? ` — ${status.lastRunSent ?? 0} versendet`
            : ' — fehlgeschlagen')
        }}
      </EuBadge>
      <EuBadge v-else tone="neutral">Noch nicht gelaufen</EuBadge>
    </template>

    <form class="eu-settings__form" @submit.prevent="saveReminders">
      <p class="eu-settings__hint">
        Eunomia meldet sich von selbst, wenn die Zahlung einer Rechnung fällig wird oder überfällig
        ist. Jeder Nutzer bekommt eine Mail über genau die Rechnungen, die er auch in der App sehen
        darf. Eine fällige Rechnung wird einmal angekündigt, eine überfällige wiederholt sich im
        eingestellten Abstand.
      </p>

      <EuToggle v-model="reminders.enabled" :label="settingLabel('reminders.enabled')" />
      <p v-if="!mailEnabled" class="eu-settings__hint">
        Der E-Mail-Versand ist ausgeschaltet — ohne ihn kann keine Erinnerung verschickt werden.
      </p>

      <div class="eu-settings__grid">
        <EuTextField
          v-model="reminders.hour"
          :label="settingLabel('reminders.hour')"
          :error="hourError"
          type="text"
        />
        <EuTextField
          v-model="reminders.repeatDays"
          :label="settingLabel('reminders.repeatDays')"
          :error="repeatError"
          type="text"
        />
      </div>

      <div class="eu-settings__grid">
        <EuTextField v-model="reminders.timeZone" :label="settingLabel('reminders.timeZone')" />
        <EuTextField v-model="reminders.appUrl" :label="settingLabel('reminders.appUrl')" />
      </div>
      <p class="eu-settings__hint">
        Die Uhrzeit gilt in dieser Zeitzone. Ohne Adresse verschickt Eunomia die Erinnerung ohne
        Link.
      </p>

      <div class="eu-settings__actions">
        <EuButton type="submit" :disabled="action.busy || Boolean(hourError || repeatError)">
          Speichern
        </EuButton>
        <EuButton variant="secondary" :icon="faEye" :disabled="action.busy" @click="runNow(true)">
          Vorschau
        </EuButton>
        <EuButton variant="secondary" :icon="faBell" :disabled="action.busy" @click="runNow(false)">
          Jetzt ausführen
        </EuButton>
      </div>

      <p v-if="saved" class="eu-settings__ok" role="status">Einstellungen gespeichert.</p>
      <p v-if="runSentence" class="eu-settings__ok" role="status">{{ runSentence }}</p>
      <p v-if="action.error" class="eu-settings__error" role="alert">{{ action.error }}</p>
      <p v-if="status.lastRunResult === 'error' && status.lastRunError" class="eu-settings__hint">
        Meldung beim letzten Lauf: {{ status.lastRunError }}
      </p>

      <template v-if="lastRun?.dryRun">
        <template v-if="lastRun.preview.length > 0">
          <p class="eu-settings__hint">Das würde versendet:</p>
          <div v-for="mailPreview in lastRun.preview" :key="mailPreview.email">
            <p class="eu-settings__hint">An {{ mailPreview.email }}: {{ mailPreview.subject }}</p>
            <pre class="eu-settings__preview">{{ mailPreview.text }}</pre>
          </div>
        </template>
        <p v-if="hiddenSentence" class="eu-settings__hint">{{ hiddenSentence }}</p>
      </template>
    </form>
  </EuCollapsibleSection>
</template>
