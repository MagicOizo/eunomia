import { apiFetch } from '../lib/api';

/**
 * The system settings endpoints (Slice 30). Mirrors the API's shapes; the
 * German labels for the keys live in lib/field-labels.ts, because a rejected
 * value has to be named in an error message too.
 */

export interface PublicSetting {
  key: string;
  section: 'mail' | 'updateCheck' | 'reminders';
  isSecret: boolean;
  readonly: boolean;
  /** Always null for a secret — the plaintext never leaves the API. */
  value: string | number | boolean | null;
  /** For a secret: whether one is stored. Otherwise: whether it differs from the default. */
  isSet: boolean;
}

export interface MailStatus {
  lastSendAt: string | null;
  lastSendResult: 'ok' | 'error' | null;
  lastSendError: string | null;
}

export interface SettingsSnapshot {
  settings: PublicSetting[];
  /** False when CONFIG_ENCRYPTION_KEY is missing: secrets can then not be stored. */
  encryptionAvailable: boolean;
  mailStatus: MailStatus;
}

/** What a reminder run reports back (apps/api/src/reminders/runner.ts). */
export interface ReminderRunResult {
  ranAt: string;
  /** Unpaid invoices considered, before the due/overdue rule. */
  invoices: number;
  /** Recipients that had at least one invoice to hear about. */
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
  /** Filled for a dry run only — a real run has already delivered these. */
  preview: Array<{ email: string; subject: string; text: string }>;
}

export type SettingWrite = Record<string, string | number | boolean | null>;

const unwrap = <T>(res: { data: T }): T => res.data;

export async function loadSettings(): Promise<SettingsSnapshot> {
  return unwrap(await apiFetch<{ data: SettingsSnapshot }>('/settings'));
}

/**
 * Writes only the keys passed. A key left out stays as it is — which is how a
 * secret keeps its stored value while the form shows only a placeholder.
 */
export async function saveSettings(values: SettingWrite): Promise<SettingsSnapshot> {
  return unwrap(
    await apiFetch<{ data: SettingsSnapshot }>('/settings', { method: 'PUT', body: { values } }),
  );
}

export async function sendTestMail(): Promise<{ recipient: string; status: MailStatus }> {
  return unwrap(
    await apiFetch<{ data: { recipient: string; status: MailStatus } }>('/settings/mail/test', {
      method: 'POST',
    }),
  );
}

/**
 * Runs the payment reminders now. `dryRun` renders what would go out without
 * sending anything or remembering that it did.
 */
export async function runReminders(dryRun: boolean): Promise<ReminderRunResult> {
  return unwrap(
    await apiFetch<{ data: ReminderRunResult }>('/settings/reminders/run', {
      method: 'POST',
      body: { dryRun },
    }),
  );
}

// The update check has no function here: its answer is shared with the footer,
// so it lives in lib/update-status.ts (issues.md 0.13.0-6).
