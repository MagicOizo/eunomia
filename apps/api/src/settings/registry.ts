import {
  ERROR_CODES,
  FORMAT_REGIONS,
  isFormatRegion,
  isHttpUrl,
  SETTING_KEYS,
  SUPPORTED_LOCALES,
  type SettingKey,
} from '@eunomia/shared';

import { badRequest } from '../lib/api-error.js';

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

export type SettingSection = 'general' | 'mail' | 'updateCheck' | 'reminders' | 'retention';

export type SettingValue = string | number | boolean | null;

interface BaseDefinition {
  section: SettingSection;
  /**
   * Written by the application, not by an admin (the status of the last send).
   * A write from the API is rejected, so the page cannot fake a green status.
   */
  readonly?: true;
}

/**
 * An extra check for a string beyond its length — a time zone the runtime does
 * not know, or a URL that is not one, is a typo whose effect would only show
 * up much later (a run at the wrong hour, a dead link in a mail).
 */
interface StringCheck {
  ok: (value: string) => boolean;
  /** Completes the sentence "Setting x must be …" in the 400. */
  expected: string;
}

type SettingDefinition = BaseDefinition &
  (
    | { type: 'string'; fallback: string | null; maxLength?: number; check?: StringCheck }
    | { type: 'int'; fallback: number | null; min: number; max: number }
    | { type: 'bool'; fallback: boolean }
    | { type: 'enum'; fallback: string; values: readonly string[] }
    /** Stored encrypted; never leaves the API as plaintext. */
    | { type: 'secret'; fallback: null }
  );

/** Whether the runtime knows this IANA zone — Intl throws for one it does not. */
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mail settings cover one SMTP account, which is all a homelab instance needs.
 * `authMethod` has exactly one value today: nodemailer can also do XOAUTH2, but
 * the work there is the provider's OAuth consent flow (app registration,
 * callback route, refresh-token handling), which is its own slice. The field
 * exists so that slice needs no migration — see the backlog.
 */
export const SETTINGS = {
  /**
   * The instance's language and format, for whoever has chosen neither in
   * their profile (Slice 82). The web asks the browser first; a mail has no
   * browser, so for it this is the next answer after the profile. An empty
   * format follows the language (de → de-DE, en → en-GB).
   */
  'general.defaultLocale': {
    section: 'general',
    type: 'enum',
    fallback: 'de',
    values: SUPPORTED_LOCALES,
  },
  'general.defaultFormat': {
    section: 'general',
    type: 'string',
    fallback: null,
    check: { ok: isFormatRegion, expected: `one of ${FORMAT_REGIONS.join(', ')}` },
  },
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

  /*
   * Payment reminders (Slice 31). What "due" means is NOT configurable here:
   * the traffic light in the invoice list defines it (DUE_SOON_DAYS in
   * @eunomia/shared), and a second, editable number could drift from it —
   * "the light is amber but no mail came". Only how often an overdue invoice
   * nags again is a matter of taste.
   */
  'reminders.enabled': { section: 'reminders', type: 'bool', fallback: false },
  /** Hour of the daily run, in `reminders.timeZone`. */
  'reminders.hour': { section: 'reminders', type: 'int', fallback: 7, min: 0, max: 23 },
  'reminders.timeZone': {
    section: 'reminders',
    type: 'string',
    fallback: 'Europe/Berlin',
    maxLength: 64,
    check: { ok: isTimeZone, expected: 'a time zone this server knows, e.g. Europe/Berlin' },
  },
  /** Days between two reminders about the same overdue invoice. */
  'reminders.repeatDays': { section: 'reminders', type: 'int', fallback: 7, min: 1, max: 90 },
  /** Optional base URL; only when set do the mails carry a link back. */
  'reminders.appUrl': {
    section: 'reminders',
    type: 'string',
    fallback: null,
    maxLength: 255,
    check: { ok: isHttpUrl, expected: 'an absolute http(s) URL, e.g. https://eunomia.example.com' },
  },
  /**
   * Status of the last run, written by the runner. `lastRunAt` doubles as the
   * scheduler's watermark ("has today's run happened?"), so that there is one
   * value rather than two that could disagree.
   */
  'reminders.lastRunAt': { section: 'reminders', type: 'string', fallback: null, readonly: true },
  /** 'ok' | 'error' — a plain string, as with the mail status. */
  'reminders.lastRunResult': {
    section: 'reminders',
    type: 'string',
    fallback: null,
    readonly: true,
  },
  'reminders.lastRunError': {
    section: 'reminders',
    type: 'string',
    fallback: null,
    readonly: true,
  },
  /** How many mails the last run sent — 0 is a perfectly good answer. */
  'reminders.lastRunSent': {
    section: 'reminders',
    type: 'int',
    fallback: null,
    min: 0,
    max: 1_000_000,
    readonly: true,
  },

  /*
   * The retention period (SEC-15, Scheibe 18). What the trash holds is deleted
   * data, and deleted data about health has no business lying around for ever;
   * after the period it goes for good, together with users that were deleted
   * longer ago than that.
   *
   * The switch defaults to OFF although the period defaults to 90 days: an
   * instance that updates into this version must not start deleting because
   * nobody read the changelog. Switching it on is a decision, and the page
   * offers a dry run first.
   */
  'retention.enabled': { section: 'retention', type: 'bool', fallback: false },
  /**
   * Days a deleted record stays in the trash. Ten years is the upper bound —
   * past that the setting says "never" more honestly than a number does.
   */
  'retention.trashDays': {
    section: 'retention',
    type: 'int',
    fallback: 90,
    min: 1,
    max: 3650,
  },
  /**
   * Status of the last sweep, written by the sweep itself (retention/sweep.ts).
   * Unlike `reminders.lastRunAt` this is NOT a watermark: the sweep runs when
   * the timer says so, because a DELETE does not care what time it is.
   */
  'retention.lastRunAt': { section: 'retention', type: 'string', fallback: null, readonly: true },
  /** 'ok' | 'error' — a plain string, as with the mail and reminder status. */
  'retention.lastRunResult': {
    section: 'retention',
    type: 'string',
    fallback: null,
    readonly: true,
  },
  'retention.lastRunError': {
    section: 'retention',
    type: 'string',
    fallback: null,
    readonly: true,
  },
  /** How many records the last sweep removed for good — 0 is a fine answer. */
  'retention.lastRunPurged': {
    section: 'retention',
    type: 'int',
    fallback: null,
    min: 0,
    max: 1_000_000,
    readonly: true,
  },
} as const satisfies Record<SettingKey, SettingDefinition>;

/**
 * The names are shared with the web, which asks for settings by key and labels
 * them in German; what a setting *is* stays here. Checking the table against
 * that list is what makes the two sides one contract: a key only this file knows
 * does not compile, and neither does one only the package knows.
 */
export { SETTING_KEYS, type SettingKey };

/** The value a `type` resolves to: everything that is not a flag or a number is text. */
type BaseValue<T> = T extends 'bool' ? boolean : T extends 'int' ? number : string;

/**
 * Every setting with the type its own definition prescribes — `mail.port` is a
 * number, `reminders.timeZone` a string, `mail.enabled` a boolean.
 *
 * Read off the table above rather than written down a second time, so adding a
 * setting still means one entry and nothing else. `null` is added exactly where
 * the fallback may be null, which is where "not configured" is a possible
 * answer: for any other fallback `… & null` is `never` and nothing is added.
 * Before this, every reader of a setting had to claim the type of its key
 * afterwards, and five of them did (CR-19).
 */
export type ResolvedSettings = {
  [K in SettingKey]:
    BaseValue<(typeof SETTINGS)[K]['type']> | ((typeof SETTINGS)[K]['fallback'] & null);
};

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
 * Rejects control characters in the text settings. `mail.fromName` goes into the
 * From header of every mail the app sends, and a line break there is the header
 * injection nobody wants to rely on nodemailer to encode away; the mail
 * password travels the same protocol. No setting has a use for a tab or a line
 * break either, so the check is the same for all of them — `trim()` only takes
 * the edges.
 */
function hasControlCharacter(value: string): boolean {
  return /\p{Cc}/u.test(value);
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
      if (hasControlCharacter(value)) return invalid('free of control characters');
      // An empty secret is a clear, not a stored empty password — otherwise a
      // form that submits every field would silently blank the password.
      return [key, value.trim() === '' ? null : value];
    }
    default: {
      if (typeof value !== 'string') return invalid('a string');
      if (hasControlCharacter(value)) return invalid('free of control characters');
      const trimmed = value.trim();
      if (def.maxLength !== undefined && trimmed.length > def.maxLength) {
        return invalid(`at most ${def.maxLength} characters long`);
      }
      // An empty value clears the setting, so it never reaches the check.
      if (trimmed !== '' && def.check !== undefined && !def.check.ok(trimmed)) {
        return invalid(def.check.expected);
      }
      return [key, trimmed === '' ? null : trimmed];
    }
  }
}
