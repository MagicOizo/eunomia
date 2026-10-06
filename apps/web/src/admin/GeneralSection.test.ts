import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withLocale } from '../test/locale';
import type { SettingWrite, SettingsSnapshot } from './settings-api';

const saveSettings = vi.fn<(values: SettingWrite) => Promise<SettingsSnapshot>>();
const loadInstanceDefaults = vi.fn<() => Promise<void>>();

vi.mock('./settings-api', () => ({
  saveSettings: (values: SettingWrite): Promise<SettingsSnapshot> => saveSettings(values),
}));
vi.mock('../lib/locale-preferences', () => ({
  loadInstanceDefaults: (): Promise<void> => loadInstanceDefaults(),
}));

const { default: GeneralSection } = await import('./GeneralSection.vue');

function snapshot(locale: string, format: string | null): SettingsSnapshot {
  const entry = (key: string, value: string | null) => ({
    key,
    section: 'general' as const,
    isSecret: false,
    readonly: false,
    value,
    isSet: true,
  });
  return {
    encryptionAvailable: true,
    mailStatus: { lastSendAt: null, lastSendResult: null, lastSendError: null },
    settings: [entry('general.defaultLocale', locale), entry('general.defaultFormat', format)],
  };
}

describe('GeneralSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSettings.mockImplementation(async (values) =>
      snapshot(
        String(values['general.defaultLocale'] ?? 'de'),
        (values['general.defaultFormat'] as string | null) ?? null,
      ),
    );
    loadInstanceDefaults.mockResolvedValue(undefined);
  });

  it('shows the stored defaults and saves both, an empty format as null', async () => {
    const wrapper = mount(GeneralSection, { props: { snapshot: snapshot('en', 'en-US') } });
    const [language, format] = wrapper.findAll('select');
    expect((language!.element as HTMLSelectElement).value).toBe('en');
    expect((format!.element as HTMLSelectElement).value).toBe('en-US');

    await format!.setValue('');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(saveSettings).toHaveBeenCalledWith({
      'general.defaultLocale': 'en',
      'general.defaultFormat': null,
    });
    // Whoever follows the instance switches without a reload.
    expect(loadInstanceDefaults).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Einstellungen gespeichert.');
  });

  it('speaks English', async () => {
    await withLocale('en', () => {
      const wrapper = mount(GeneralSection, { props: { snapshot: snapshot('de', null) } });
      expect(wrapper.text()).toContain('Language and format');
      expect(wrapper.text()).toContain('From the language');
    });
  });
});
