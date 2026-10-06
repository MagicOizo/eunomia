import type { RetentionKind } from '@eunomia/shared';

import { apiData } from '../lib/api';

/**
 * The system settings endpoints (Slice 30). Mirrors the API's shapes; the
 * labels for the keys live in lib/field-labels.ts, because a rejected
 * value has to be named in an error message too.
 */

export interface PublicSetting {
  key: string;
  section: 'general' | 'mail' | 'updateCheck' | 'reminders' | 'retention';
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
  /**
   * Recipients whose mail is withheld because the caller may not read the
   * invoices it speaks about (API: SEC-03). Counted, never shown.
   */
  previewHidden: number;
}

/**
 * What a sweep of the retention period did, or would do
 * (apps/api/src/retention/sweep.ts). Numbers only, never a label: the page is
 * guarded by MANAGE_SETTINGS, which says nothing about reading invoices.
 */
export interface RetentionRunResult {
  ranAt: string;
  days: number;
  cutoff: string;
  /** Expired trash entries removed for good. */
  purged: number;
  users: number;
  /** Entries something active still points at; the next sweep tries again. */
  skipped: number;
  /** Per kind of record (`RetentionKind`), named by the web (lib/kind-names.ts). */
  byKind: Array<{ kind: RetentionKind; purged: number; skipped: number }>;
  dryRun: boolean;
}

export type SettingWrite = Record<string, string | number | boolean | null>;

export async function loadSettings(): Promise<SettingsSnapshot> {
  return apiData<SettingsSnapshot>('/settings');
}

/**
 * Writes only the keys passed. A key left out stays as it is — which is how a
 * secret keeps its stored value while the form shows only a placeholder.
 */
export async function saveSettings(values: SettingWrite): Promise<SettingsSnapshot> {
  return apiData<SettingsSnapshot>('/settings', { method: 'PUT', body: { values } });
}

export async function sendTestMail(): Promise<{ recipient: string; status: MailStatus }> {
  return apiData<{ recipient: string; status: MailStatus }>('/settings/mail/test', {
    method: 'POST',
  });
}

/**
 * Runs the payment reminders now. `dryRun` renders what would go out without
 * sending anything or remembering that it did.
 */
export async function runReminders(dryRun: boolean): Promise<ReminderRunResult> {
  return apiData<ReminderRunResult>('/settings/reminders/run', {
    method: 'POST',
    body: { dryRun },
  });
}

/**
 * Empties the trash of what has aged out. A dry run only counts — and works
 * while the period is switched off, which is how one decides to switch it on.
 */
export async function runRetention(dryRun: boolean): Promise<RetentionRunResult> {
  return apiData<RetentionRunResult>('/settings/retention/run', {
    method: 'POST',
    body: { dryRun },
  });
}

// The update check has no function here: its answer is shared with the footer,
// so it lives in lib/update-status.ts (issues.md 0.13.0-6).
