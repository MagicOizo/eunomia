import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withLocale } from '../test/locale';

import type { RetentionRunResult, SettingWrite, SettingsSnapshot } from './settings-api';

/**
 * The retention period in the settings page (Scheibe 18, SEC-15). What matters
 * here is the difference between the two buttons: a dry run says what would go,
 * a real run deletes — and the second one must not be reachable while the
 * period is switched off.
 */

const saveSettings = vi.fn<(values: SettingWrite) => Promise<SettingsSnapshot>>();
const loadSettings = vi.fn<() => Promise<SettingsSnapshot>>();
const runRetention = vi.fn<(dryRun: boolean) => Promise<RetentionRunResult>>();

vi.mock('./settings-api', () => ({
  saveSettings: (values: SettingWrite): Promise<SettingsSnapshot> => saveSettings(values),
  loadSettings: (): Promise<SettingsSnapshot> => loadSettings(),
  runRetention: (dryRun: boolean): Promise<RetentionRunResult> => runRetention(dryRun),
}));

const { default: RetentionSection } = await import('./RetentionSection.vue');

function snapshot(values: Record<string, string | number | boolean | null> = {}): SettingsSnapshot {
  const all: Record<string, string | number | boolean | null> = {
    'retention.enabled': true,
    'retention.trashDays': 90,
    'retention.lastRunAt': '2026-10-04T03:00:00.000Z',
    'retention.lastRunResult': 'ok',
    'retention.lastRunError': null,
    'retention.lastRunPurged': 7,
    ...values,
  };
  return {
    encryptionAvailable: true,
    mailStatus: { lastSendAt: null, lastSendResult: null, lastSendError: null },
    settings: Object.entries(all).map(([key, value]) => ({
      key,
      section: 'retention' as const,
      isSecret: false,
      readonly: key.startsWith('retention.lastRun'),
      value,
      isSet: value !== null,
    })),
  };
}

function result(overrides: Partial<RetentionRunResult> = {}): RetentionRunResult {
  return {
    ranAt: '2026-10-04T12:00:00.000Z',
    days: 90,
    cutoff: '2026-07-06T12:00:00.000Z',
    purged: 3,
    users: 0,
    skipped: 0,
    byKind: [{ kind: 'invoice', purged: 3, skipped: 0 }],
    dryRun: false,
    ...overrides,
  };
}

const mountSection = (values: Record<string, string | number | boolean | null> = {}) =>
  mount(RetentionSection, { props: { snapshot: snapshot(values) } });

const button = (wrapper: ReturnType<typeof mountSection>, label: string) =>
  wrapper.findAll('button').find((one) => one.text().includes(label));

describe('RetentionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSettings.mockImplementation(async () => snapshot());
    loadSettings.mockImplementation(async () => snapshot());
    runRetention.mockImplementation(async (dryRun) => result({ dryRun }));
  });

  it('reports what the last sweep removed', () => {
    const wrapper = mountSection();
    expect(wrapper.text()).toContain('Letzter Lauf');
    expect(wrapper.text()).toContain('7 entfernt');
  });

  it('says plainly that undated entries are never swept', () => {
    expect(mountSection().text()).toContain('kein Löschdatum');
  });

  it('writes the switch and the number of days', async () => {
    const wrapper = mountSection();
    await wrapper.find('input[type="text"]').setValue('30');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(saveSettings).toHaveBeenCalledWith({
      'retention.enabled': true,
      'retention.trashDays': 30,
    });
  });

  it('refuses an impossible period instead of sending it', async () => {
    const wrapper = mountSection();
    await wrapper.find('input[type="text"]').setValue('0');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Bitte eine Zahl zwischen 1 und 3650 angeben.');
  });

  it('a dry run says what would go and that nothing went', async () => {
    const wrapper = mountSection();
    runRetention.mockResolvedValueOnce(result({ dryRun: true, purged: 2, users: 1, skipped: 1 }));

    await button(wrapper, 'Probelauf')!.trigger('click');
    await flushPromises();

    expect(runRetention).toHaveBeenCalledWith(true);
    const text = wrapper.text();
    expect(text).toContain('Probelauf');
    expect(text).toContain('2 Einträge');
    expect(text).toContain('1 gelöschter Nutzer');
    expect(text).toContain('Es wurde nichts gelöscht');
    expect(text).toContain('älter als 90 Tage');
    // The per-kind list is numbers and names of kinds, never a record's label.
    expect(text).toContain('Rechnungen');
  });

  it('a real sweep asks for a real run and says what went', async () => {
    const wrapper = mountSection();
    await button(wrapper, 'Jetzt aufräumen')!.trigger('click');
    await flushPromises();

    expect(runRetention).toHaveBeenCalledWith(false);
    expect(wrapper.text()).toContain('3 Einträge endgültig gelöscht.');
    // The status comes from the settings, so they are read back afterwards.
    expect(loadSettings).toHaveBeenCalled();
  });

  it('counts a kind that nothing could be removed from as what stays', async () => {
    const wrapper = mountSection();
    runRetention.mockResolvedValueOnce(
      result({
        purged: 0,
        skipped: 1,
        days: 1,
        byKind: [{ kind: 'facility', purged: 0, skipped: 1 }],
      }),
    );

    await button(wrapper, 'Jetzt aufräumen')!.trigger('click');
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('1 Leistungserbringer bleibt noch');
    expect(text).not.toContain('0 Leistungserbringer');
    // One day is one day, not "1 Tage".
    expect(text).toContain('0 Einträge endgültig gelöscht');
  });

  it('cannot be swept by hand while the period is switched off', () => {
    const wrapper = mountSection({ 'retention.enabled': false });
    expect(button(wrapper, 'Jetzt aufräumen')!.attributes('disabled')).toBeDefined();
    // The dry run stays available: it is how one decides to switch it on.
    expect(button(wrapper, 'Probelauf')!.attributes('disabled')).toBeUndefined();
  });

  it('shows the message of a failed sweep', () => {
    const wrapper = mountSection({
      'retention.lastRunResult': 'error',
      'retention.lastRunError': 'Deadlock found when trying to get lock',
    });
    expect(wrapper.text()).toContain('fehlgeschlagen');
    expect(wrapper.text()).toContain('Deadlock found when trying to get lock');
  });

  it('reports a dry run in English, with the kinds named', async () => {
    await withLocale('en', async () => {
      const wrapper = mountSection();
      runRetention.mockResolvedValueOnce(
        result({ dryRun: true, purged: 2, users: 1, skipped: 1, days: 1 }),
      );
      await button(wrapper, 'Dry run')!.trigger('click');
      await flushPromises();
      const text = wrapper.text();
      expect(text).toContain(
        'Dry run: 2 entries and 1 deleted user older than 1 day would be deleted permanently.',
      );
      expect(text).toContain('1 entry remains: something active still hangs on it.');
      expect(text).toContain('3 invoices');
    });
  });
});
