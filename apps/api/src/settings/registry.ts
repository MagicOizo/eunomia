import { badRequest } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';

/**
 * The catalog of system settings (see Notes/eunomia-plan.md, 2.6): what exists,
 * what type it has, what it falls back to, and whether it is a secret. This is
 * the contract with the UI — an unknown key in a write is a 400, not a silently
 * stored row, so a typo cannot create a setting nothing ever reads.
 *
 * The database stores text; the typed value is produced here. Adding a setting
 * means one entry in this table and nothing else: no migration, because the
 * storage is key-value (migration 009).
 */

export type SettingSection = 'mail' | 'updateCheck';

export type SettingValue = string | number | boolean | null;

interface BaseDefinition {
  section: SettingSection;
  /**
   * Written by the application, not by an admin (the status of the last send).
   * A write from the API is rejected, so the page cannot fake a green status.
   */
  readonly?: true;
}

type SettingDefinition = BaseDefinition &
  (
    | { type: 'string'; fallback: string | null; maxLength?: number }
    | { type: 'int'; fallback: number | null; min: number; max: number }
    | { type: 'bool'; fallback: boolean }
    | { type: 'enum'; fallback: string; values: readonly string[] }
    /** Stored encrypted; never leaves the API as plaintext. */
    | { type: 'secret'; fallback: null }
  );

/**
 * Mail settings cover one SMTP account, which is all a homelab instance needs.
 * `authMethod` has exactly one value today: nodemailer can also do XOAUTH2, but
 * the work there is the provider's OAuth consent flow (app registration,
 * callback route, refresh-token handling), which is its own slice. The field
 * exists so that slice needs no migration — see the backlog.
 */
export const SETTINGS = {
  'mail.enabled': { section: 'mail', type: 'bool', fallback: false },
  'mail.host': { section: 'mail', type: 'string', fallback: null, maxLength: 255 },
  'mail.port': { section: 'mail', type: 'int', fallback: 587, min: 1, max: 65535 },
  /** Implicit TLS from the first byte (port 465). Off means STARTTLS (587). */
  'mail.secure': { section: 'mail', type: 'bool', fallback: false },
  'mail.authMethod': { section: 'mail', type: 'enum', fallback: 'PASSWORD', values: ['PASSWORD'] },
  'mail.user': { section: 'mail', type: 'string', fallback: null, maxLength: 255 },
  'mail.password': { section: 'mail', type: 'secret', fallback: null },
  'mail.fromAddress': { section: 'mail', type: 'string', fallback: null, maxLength: 255 },
  'mail.fromName': { section: 'mail', type: 'string', fallback: 'Eunomia', maxLength: 100 },
  /** Status of the last send attempt, written by the mailer (not by an admin). */
  'mail.lastSendAt': { section: 'mail', type: 'string', fallback: null, readonly: true },
  /** 'ok' | 'error' — a plain string, since only the mailer ever writes it. */
  'mail.lastSendResult': { section: 'mail', type: 'string', fallback: null, readonly: true },
  'mail.lastSendError': { section: 'mail', type: 'string', fallback: null, readonly: true },
  /**
   * Read-only GitHub token for the update check. The `.env` variable
   * UPDATE_CHECK_TOKEN keeps working; a value stored here takes precedence, so
   * the token can be rotated without touching the container's environment.
   */
  'updateCheck.token': { section: 'updateCheck', type: 'secret', fallback: null },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** Narrowing helper: the definitions are `as const`, the checks need the wide type. */
function definition(key: SettingKey): SettingDefinition {
  return SETTINGS[key] as SettingDefinition;
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

export function isSecretKey(key: SettingKey): boolean {
  return definition(key).type === 'secret';
}

export function isReadonlyKey(key: SettingKey): boolean {
  return definition(key).readonly === true;
}

export function sectionOf(key: SettingKey): SettingSection {
  return definition(key).section;
}

/** The value used when nothing is stored — the documented default of the setting. */
export function fallbackOf(key: SettingKey): SettingValue {
  return definition(key).fallback;
}

/**
 * Turns the stored text into the typed value the application works with. A row
 * that cannot be parsed (hand-edited in the database) falls back to the default
 * rather than throwing: a broken row must not take the settings page down.
 */
export function parseStoredValue(key: SettingKey, stored: string | null): SettingValue {
  const def = definition(key);
  if (stored === null) return def.fallback;
  switch (def.type) {
    case 'bool':
      return stored === 'true';
    case 'int': {
      const parsed = Number(stored);
      return Number.isInteger(parsed) ? parsed : def.fallback;
    }
    default:
      return stored;
  }
}

/** Turns a typed value into the text stored in the table. */
export function serializeValue(value: SettingValue): string | null {
  return value === null ? null : String(value);
}

/**
 * Validates an incoming write and returns the key together with the value to
 * store. `null` always means "clear this setting" (and for a secret: forget the
 * stored password); a key the caller must not write, or a value of the wrong
 * shape, is a 400 with its own code so the UI can name the field.
 *
 * The validated key comes back narrowed, so callers need no cast.
 */
export function validateIncoming(key: string, value: unknown): [SettingKey, SettingValue] {
  if (!isSettingKey(key)) {
    throw badRequest(`Unknown setting: ${key}`, {
      code: ERROR_CODES.SETTING_UNKNOWN,
      details: { key },
    });
  }
  if (isReadonlyKey(key)) {
    throw badRequest(`Setting is written by the application: ${key}`, {
      code: ERROR_CODES.SETTING_READONLY,
      details: { key },
    });
  }

  const invalid = (expected: string): never => {
    throw badRequest(`Setting ${key} must be ${expected}`, {
      code: ERROR_CODES.SETTING_INVALID_VALUE,
      details: { key, expected },
    });
  };

  if (value === null) return [key, null];
  const def = definition(key);

  switch (def.type) {
    case 'bool':
      return [key, typeof value === 'boolean' ? value : invalid('true or false')];
    case 'int': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return invalid(`a whole number between ${def.min} and ${def.max}`);
      }
      if (value < def.min || value > def.max) {
        return invalid(`a whole number between ${def.min} and ${def.max}`);
      }
      return [key, value];
    }
    case 'enum':
      return [
        key,
        typeof value === 'string' && def.values.includes(value)
          ? value
          : invalid(`one of: ${def.values.join(', ')}`),
      ];
    case 'secret': {
      if (typeof value !== 'string') return invalid('a string');
      // An empty secret is a clear, not a stored empty password — otherwise a
      // form that submits every field would silently blank the password.
      return [key, value.trim() === '' ? null : value];
    }
    default: {
      if (typeof value !== 'string') return invalid('a string');
      const trimmed = value.trim();
      if (def.maxLength !== undefined && trimmed.length > def.maxLength) {
        return invalid(`at most ${def.maxLength} characters long`);
      }
      return [key, trimmed === '' ? null : trimmed];
    }
  }
}
