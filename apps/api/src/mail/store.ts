import type { Pool } from 'mariadb';

import type { SettingKey, SettingValue } from '../settings/registry.js';
import { type EncryptionKey, getSettings, setApplicationValues } from '../settings/repository.js';
import type { MailSendStatus, MailSettingsStore } from './mailer.js';

/**
 * The database-backed settings store the mailer runs against in the app (its
 * unit tests use a plain object instead). The status keys are written through
 * `setApplicationValues`, which bypasses the readonly guard the API applies to
 * client writes — the mailer is the one component allowed to set them.
 */
export function createMailSettingsStore(
  pool: Pool,
  encryptionKey: EncryptionKey,
): MailSettingsStore {
  return {
    read: async (): Promise<Record<SettingKey, SettingValue>> => getSettings(pool, encryptionKey),
    writeStatus: async (status: MailSendStatus): Promise<void> => {
      await setApplicationValues(
        pool,
        new Map<SettingKey, SettingValue>([
          ['mail.lastSendAt', status.lastSendAt],
          ['mail.lastSendResult', status.lastSendResult],
          ['mail.lastSendError', status.lastSendError],
        ]),
      );
    },
  };
}
