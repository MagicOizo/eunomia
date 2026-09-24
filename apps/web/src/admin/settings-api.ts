import { apiFetch } from '../lib/api';

/**
 * The system settings endpoints (Slice 30). Mirrors the API's shapes; the
 * German labels for the keys live in lib/field-labels.ts, because a rejected
 * value has to be named in an error message too.
 */

export interface PublicSetting {
  key: string;
  section: 'mail' | 'updateCheck';
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

/** Mirrors the API's UpdateStatus (apps/api/src/lib/update-check.ts). */
export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string | null;
  status: 'ok' | 'disabled' | 'unavailable';
  reason?:
    'no_token_private' | 'not_found' | 'network' | 'rate_limited' | 'unauthorized' | 'no_release';
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

export async function loadUpdateStatus(): Promise<UpdateStatus> {
  return unwrap(await apiFetch<{ data: UpdateStatus }>('/update-check'));
}

/** Asks GitHub now instead of reusing the cached answer (the "check now" button). */
export async function refreshUpdateStatus(): Promise<UpdateStatus> {
  return unwrap(
    await apiFetch<{ data: UpdateStatus }>('/update-check/refresh', { method: 'POST' }),
  );
}
