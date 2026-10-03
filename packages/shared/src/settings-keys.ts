/**
 * The keys of the system settings (see Notes/eunomia-plan.md, 2.6). What each
 * one is — type, fallback, section, whether it is a secret or written by the
 * application — stays in the API's registry (settings/registry.ts), which is the
 * only side that reads or validates a value. Shared is the list of names,
 * because the web asks for them by name and labels them in German: the registry
 * and the label table are checked against this list, so neither can carry a key
 * the other does not know.
 */
export const SETTING_KEYS = [
  'mail.enabled',
  'mail.host',
  'mail.port',
  'mail.secure',
  'mail.authMethod',
  'mail.user',
  'mail.password',
  'mail.fromAddress',
  'mail.fromName',
  'mail.lastSendAt',
  'mail.lastSendResult',
  'mail.lastSendError',
  'updateCheck.token',
  'reminders.enabled',
  'reminders.hour',
  'reminders.timeZone',
  'reminders.repeatDays',
  'reminders.appUrl',
  'reminders.lastRunAt',
  'reminders.lastRunResult',
  'reminders.lastRunError',
  'reminders.lastRunSent',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
