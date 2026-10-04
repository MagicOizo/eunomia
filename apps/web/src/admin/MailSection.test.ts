import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EuTextField from '../design-system/components/EuTextField.vue';
import type { SettingWrite, SettingsSnapshot } from './settings-api';

/**
 * The rule the API documents and nothing checked (CR-34): an untouched
 * password field must not reach the server. A write that left `mail.password`
 * out keeps the stored secret; a write that sends `null` forgets it — so an
 * empty field sent as an empty string, or sent at all, would silently destroy
 * the SMTP account on every unrelated save.
 */

const saveSettings = vi.fn<(values: SettingWrite) => Promise<SettingsSnapshot>>();
const loadSettings = vi.fn<() => Promise<SettingsSnapshot>>();
const sendTestMail = vi.fn();

vi.mock('./settings-api', () => ({
  saveSettings: (values: SettingWrite): Promise<SettingsSnapshot> => saveSettings(values),
  loadSettings: (): Promise<SettingsSnapshot> => loadSettings(),
  sendTestMail: (): Promise<unknown> => sendTestMail(),
}));

const { default: MailSection } = await import('./MailSection.vue');

/** A configured mail account with a password already stored. */
function snapshot(passwordStored = true): SettingsSnapshot {
  const entry = (
    key: string,
    value: string | number | boolean | null,
    isSecret = false,
    isSet = true,
  ) => ({ key, section: 'mail' as const, isSecret, readonly: false, value, isSet });
  return {
    encryptionAvailable: true,
    mailStatus: { lastSendAt: null, lastSendResult: null, lastSendError: null },
    settings: [
      entry('mail.enabled', true),
      entry('mail.host', 'smtp.example.com'),
      entry('mail.port', 587),
      entry('mail.secure', false),
      entry('mail.user', 'postmaster@example.com'),
      entry('mail.fromAddress', 'noreply@example.com'),
      entry('mail.fromName', 'Eunomia'),
      entry('mail.password', null, true, passwordStored),
    ],
  };
}

function mountSection(passwordStored = true) {
  return mount(MailSection, { props: { snapshot: snapshot(passwordStored) } });
}

/** The password input, found by the label the registry gives it. */
function passwordField(wrapper: ReturnType<typeof mountSection>) {
  const field = wrapper
    .findAllComponents(EuTextField)
    .find((candidate) => candidate.props('type') === 'password');
  if (!field) throw new Error('no password field in the mail form');
  return field.find('input');
}

async function save(wrapper: ReturnType<typeof mountSection>): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('MailSection password field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSettings.mockImplementation(() => Promise.resolve(snapshot()));
    loadSettings.mockImplementation(() => Promise.resolve(snapshot()));
  });

  it('leaves the stored password alone when the field was not touched', async () => {
    const wrapper = mountSection();
    expect(passwordField(wrapper).element.value).toBe('');

    await save(wrapper);

    expect(saveSettings).toHaveBeenCalledTimes(1);
    const values = saveSettings.mock.calls[0][0];
    expect('mail.password' in values).toBe(false);
    // The rest of the form does go out, so this is not a write that did nothing.
    expect(values['mail.host']).toBe('smtp.example.com');
    expect(values['mail.port']).toBe(587);
  });

  it('sends the password that was typed', async () => {
    const wrapper = mountSection();
    await passwordField(wrapper).setValue('hunter2');

    await save(wrapper);

    expect(saveSettings.mock.calls[0][0]['mail.password']).toBe('hunter2');
  });

  it('forgets the stored password only when asked to, and asks for nothing else', async () => {
    const wrapper = mountSection();
    const remove = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Passwort entfernen'));
    expect(remove, 'the button only appears while a password is stored').toBeTruthy();

    await remove?.trigger('click');
    await flushPromises();

    expect(saveSettings).toHaveBeenCalledWith({ 'mail.password': null });
  });

  it('offers no removal while nothing is stored', () => {
    const wrapper = mountSection(false);
    const remove = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Passwort entfernen'));
    expect(remove).toBeUndefined();
    expect(wrapper.text()).toContain('Leer lassen, wenn der Mailserver keine Anmeldung verlangt.');
  });

  it('refuses to save an impossible port instead of sending it', async () => {
    const wrapper = mountSection();
    const port = wrapper
      .findAllComponents(EuTextField)
      .find((candidate) => candidate.props('label')?.includes('Port'));
    await port?.find('input').setValue('70000');

    await save(wrapper);

    expect(saveSettings).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Bitte eine Portnummer zwischen 1 und 65535 angeben.');
  });

  it('an empty port falls back to 587 rather than writing nothing', async () => {
    const wrapper = mountSection();
    const port = wrapper
      .findAllComponents(EuTextField)
      .find((candidate) => candidate.props('label')?.includes('Port'));
    await port?.find('input').setValue('');

    await save(wrapper);

    expect(saveSettings.mock.calls[0][0]['mail.port']).toBe(587);
  });
});
