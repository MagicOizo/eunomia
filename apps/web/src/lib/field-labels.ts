import type { SettingKey } from '@eunomia/shared';

import { i18n, type MessageSchema } from './i18n';

/**
 * Labels for the API's payload keys, so a validation error can name the field
 * the user sees ("Bitte „PLZ" ausfüllen.") instead of repeating the server's
 * English sentence. One dictionary for the whole app (`fields` in the
 * catalogue): the keys are unique across the resources, and a central list is
 * easier to keep complete than labels threaded through every dialog
 * (errors.spec.ts checks the master-data configs against it).
 *
 * The keys arrive as data — from a zod issue's path, from a setting's name — so
 * whether one has a label is only known at run time.
 */

const { t, te } = i18n.global;

type FieldKey = keyof MessageSchema['fields'] & string;
type FormatKey = keyof MessageSchema['fieldFormats'] & string;
type SettingGroups = MessageSchema['settingLabels'];
type SettingLabelPath = {
  [G in keyof SettingGroups & string]: `settingLabels.${G}.${keyof SettingGroups[G] & string}`;
}[keyof SettingGroups & string];

/** The label of a payload key, or the key itself if it has none yet. */
export function fieldLabel(key: string): string {
  const path = `fields.${key}`;
  return te(path) ? t(path as `fields.${FieldKey}`) : key;
}

/**
 * What a field has to look like, for the rules the API enforces with a regular
 * expression — its message alone ("Expected a 5-digit postal code") says it in
 * English and in the API's words. Null where none is written down.
 */
export function fieldFormat(key: string): string | null {
  const path = `fieldFormats.${key}`;
  return te(path) ? t(path as `fieldFormats.${FormatKey}`) : null;
}

/**
 * The label of a system setting (Slice 30) — both the settings page and an
 * error message about a rejected value need the same words. The catalogue
 * nests them the way the keys are spelled (`mail.host` → `settingLabels.mail.host`).
 *
 * Not every key has a label: the ones the application writes itself (the status
 * of the last send or run) are shown as a sentence, not as a field. The key
 * may also arrive as plain text from the server's `details`, so it may be one
 * this version does not know; either way the key itself stands in.
 */
export function settingLabel(key: SettingKey | (string & {})): string {
  const path = `settingLabels.${key}`;
  return te(path) ? t(path as SettingLabelPath) : key;
}
