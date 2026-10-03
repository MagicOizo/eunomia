import type { PublicSetting, SettingsSnapshot } from './settings-api';

/**
 * Reading one value out of a settings snapshot. The three sections each fill
 * their own form from the snapshot the page loaded, so the lookup — and the
 * fallback that stands in for a value the API did not send — belongs here
 * rather than three times over (CR-30).
 */
function entryOf(snapshot: SettingsSnapshot, key: string): PublicSetting | undefined {
  return snapshot.settings.find((entry) => entry.key === key);
}

/** The value as text, with `fallback` where the snapshot has none. */
export function stringOf(snapshot: SettingsSnapshot, key: string, fallback = ''): string {
  const value = entryOf(snapshot, key)?.value;
  return value === null || value === undefined ? fallback : String(value);
}

/** True only for a stored `true` — an absent setting is off. */
export function boolOf(snapshot: SettingsSnapshot, key: string): boolean {
  return entryOf(snapshot, key)?.value === true;
}

/**
 * Whether a secret is stored. Its plaintext never leaves the API, so this is
 * all a form can know about it — and why an empty field means "leave it alone".
 */
export function isStored(snapshot: SettingsSnapshot, key: string): boolean {
  return entryOf(snapshot, key)?.isSet === true;
}

/** A readonly status setting, as the runner wrote it (see the registry). */
export function statusOf(
  snapshot: SettingsSnapshot,
  key: string,
): string | number | boolean | null {
  return entryOf(snapshot, key)?.value ?? null;
}
