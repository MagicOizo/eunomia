import { ERROR_CODES } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../lib/api-error.js';
import { logEvent } from '../lib/log.js';
import { SecretBoxError, decryptSecret, encryptSecret } from '../lib/secret-box.js';
import {
  SETTING_KEYS,
  type ResolvedSettings,
  type SettingKey,
  type SettingValue,
  fallbackOf,
  isReadonlyKey,
  isSecretKey,
  isSettingKey,
  parseStoredValue,
  sectionOf,
  serializeValue,
} from './registry.js';

/**
 * Reads and writes the SystemSettings table (migration 009), encrypting the
 * values the registry marks as secrets.
 *
 * There is deliberately no cache. Settings are read when the settings page is
 * opened, when a mail is sent and when the update check runs — rare enough that
 * a query is cheaper than a cache whose invalidation could go wrong (a stale
 * SMTP password that "works after a restart" is exactly the bug class to avoid).
 */

/** The encryption key, or null when CONFIG_ENCRYPTION_KEY is not configured. */
export type EncryptionKey = Buffer | null;

/** What the API hands to the UI: a secret appears as `isSet`, never as its value. */
export interface PublicSetting {
  key: SettingKey;
  section: string;
  isSecret: boolean;
  readonly: boolean;
  /** Null for every secret — the plaintext never leaves the API. */
  value: SettingValue;
  isSet: boolean;
}

function encryptionUnavailable(): ApiError {
  return new ApiError(
    409,
    ERROR_CODES.SETTINGS_ENCRYPTION_UNAVAILABLE,
    'CONFIG_ENCRYPTION_KEY is not configured, so secrets can be neither stored nor read',
  );
}

/** Reads the raw rows, ignoring keys that are no longer in the registry. */
async function readRows(pool: Pool): Promise<Map<SettingKey, string | null>> {
  const rows = await pool.query<Array<{ settingKey: string; settingValue: string | null }>>(
    'SELECT settingKey, settingValue FROM SystemSettings',
  );
  const stored = new Map<SettingKey, string | null>();
  for (const row of rows) {
    if (isSettingKey(row.settingKey)) stored.set(row.settingKey, row.settingValue);
  }
  return stored;
}

/**
 * Resolves every setting to its typed value, decrypting secrets with `key`.
 *
 * A secret that cannot be decrypted (wrong or rotated key) resolves to null and
 * logs one greppable event instead of throwing: the mailer then reports "not
 * configured" and the settings page stays usable so the admin can enter the
 * password again.
 */
export async function getSettings(pool: Pool, key: EncryptionKey): Promise<ResolvedSettings> {
  const stored = await readRows(pool);
  const resolved: Record<string, SettingValue> = {};

  for (const settingKey of SETTING_KEYS) {
    const raw = stored.get(settingKey) ?? null;
    if (!isSecretKey(settingKey)) {
      resolved[settingKey] = parseStoredValue(settingKey, raw);
      continue;
    }
    if (raw === null) {
      resolved[settingKey] = null;
      continue;
    }
    if (key === null) {
      logEvent('warn', 'SETTINGS_SECRET_UNREADABLE', {
        key: settingKey,
        reason: 'no_encryption_key',
      });
      resolved[settingKey] = null;
      continue;
    }
    try {
      resolved[settingKey] = decryptSecret(raw, key);
    } catch (error) {
      logEvent('error', 'SETTINGS_SECRET_UNREADABLE', {
        key: settingKey,
        reason: 'decrypt_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      resolved[settingKey] = null;
    }
  }

  // The one place the settings are claimed rather than checked: the loop above
  // runs over every key of the registry and writes each one the value its own
  // definition prescribes — which is what the compiler cannot follow through
  // the key union. It used to cost a claim at every reader instead.
  return resolved as ResolvedSettings;
}

/** The settings as the UI may see them: values for everything but secrets. */
export async function getPublicSettings(pool: Pool): Promise<PublicSetting[]> {
  const stored = await readRows(pool);

  return SETTING_KEYS.map((key) => {
    const raw = stored.get(key) ?? null;
    const secret = isSecretKey(key);
    return {
      key,
      section: sectionOf(key),
      isSecret: secret,
      readonly: isReadonlyKey(key),
      value: secret ? null : parseStoredValue(key, raw),
      isSet: secret ? raw !== null : parseStoredValue(key, raw) !== fallbackOf(key),
    };
  });
}

/**
 * Writes a batch of settings in one transaction, so a half-applied mail
 * configuration cannot exist. Values are already validated by the registry.
 *
 * `null` deletes the row, which means the setting falls back to its documented
 * default — and for a secret, that the stored password is forgotten.
 */
export async function setSettings(
  pool: Pool,
  updates: Map<SettingKey, SettingValue>,
  key: EncryptionKey,
  userId: number | null,
): Promise<void> {
  if (updates.size === 0) return;

  for (const settingKey of updates.keys()) {
    if (isSecretKey(settingKey) && updates.get(settingKey) !== null && key === null) {
      throw encryptionUnavailable();
    }
  }

  await withTransaction(pool, async (conn) => {
    for (const [settingKey, value] of updates) {
      if (value === null) {
        await conn.query('DELETE FROM SystemSettings WHERE settingKey = ?', [settingKey]);
        continue;
      }
      const stored = isSecretKey(settingKey)
        ? encryptSecretOrFail(String(value), key)
        : serializeValue(value);
      await conn.query(
        `INSERT INTO SystemSettings (settingKey, settingValue, updatedByUserID)
              VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue),
                                 updatedByUserID = VALUES(updatedByUserID)`,
        [settingKey, stored, userId],
      );
    }
  });
}

/** Encrypts, turning a key problem into the same API error as a missing key. */
function encryptSecretOrFail(plaintext: string, key: EncryptionKey): string {
  if (key === null) throw encryptionUnavailable();
  try {
    return encryptSecret(plaintext, key);
  } catch (error) {
    if (error instanceof SecretBoxError) throw encryptionUnavailable();
    throw error;
  }
}

/**
 * Writes the application-owned status values (which the API refuses from a
 * client). Never encrypted — these are timestamps and error texts.
 */
export async function setApplicationValues(
  pool: Pool,
  updates: Map<SettingKey, SettingValue>,
): Promise<void> {
  for (const [settingKey, value] of updates) {
    if (value === null) {
      await pool.query('DELETE FROM SystemSettings WHERE settingKey = ?', [settingKey]);
      continue;
    }
    await pool.query(
      `INSERT INTO SystemSettings (settingKey, settingValue)
            VALUES (?, ?)
       ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue)`,
      [settingKey, serializeValue(value)],
    );
  }
}
