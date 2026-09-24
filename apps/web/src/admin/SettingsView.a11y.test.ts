import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SettingWrite, SettingsSnapshot, UpdateStatus } from './settings-api';

const loadSettings = vi.fn<() => Promise<SettingsSnapshot>>();
const saveSettings = vi.fn<(values: SettingWrite) => Promise<SettingsSnapshot>>();
const sendTestMail = vi.fn();
const loadUpdateStatus = vi.fn<() => Promise<UpdateStatus>>();
const refreshUpdateStatus = vi.fn<() => Promise<UpdateStatus>>();

vi.mock('./settings-api', () => ({
  loadSettings: (): Promise<SettingsSnapshot> => loadSettings(),
  saveSettings: (values: SettingWrite): Promise<SettingsSnapshot> => saveSettings(values),
  sendTestMail: (): Promise<unknown> => sendTestMail(),
  loadUpdateStatus: (): Promise<UpdateStatus> => loadUpdateStatus(),
  refreshUpdateStatus: (): Promise<UpdateStatus> => refreshUpdateStatus(),
}));

const { default: SettingsView } = await import('./SettingsView.vue');

/** A snapshot with a configured mail account and a stored password. */
function snapshot(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    encryptionAvailable: true,
    mailStatus: {
      lastSendAt: '2026-09-24T08:30:00.000Z',
      lastSendResult: 'error',
      lastSendError: 'Invalid login: 535 nope',
    },
    settings: [
      {
        key: 'mail.enabled',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: true,
        isSet: true,
      },
      {
        key: 'mail.host',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: 'smtp.example.com',
        isSet: true,
      },
      {
        key: 'mail.port',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: 587,
        isSet: false,
      },
      {
        key: 'mail.secure',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: false,
        isSet: false,
      },
      {
        key: 'mail.user',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: 'eunomia@example.com',
        isSet: true,
      },
      {
        key: 'mail.password',
        section: 'mail',
        isSecret: true,
        readonly: false,
        value: null,
        isSet: true,
      },
      {
        key: 'mail.fromAddress',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: 'eunomia@example.com',
        isSet: true,
      },
      {
        key: 'mail.fromName',
        section: 'mail',
        isSecret: false,
        readonly: false,
        value: 'Eunomia',
        isSet: false,
      },
      {
        key: 'updateCheck.token',
        section: 'updateCheck',
        isSecret: true,
        readonly: false,
        value: null,
        isSet: false,
      },
    ],
    ...overrides,
  };
}

const privateRepo: UpdateStatus = {
  current: '0.10.0',
  latest: null,
  updateAvailable: false,
  releaseUrl: null,
  checkedAt: null,
  status: 'unavailable',
  reason: 'no_token_private',
};

async function mountView(attach = false) {
  const wrapper = mount(SettingsView, attach ? { attachTo: document.body } : {});
  await flushPromises();
  return wrapper;
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSettings.mockResolvedValue(snapshot());
    saveSettings.mockImplementation(async () => snapshot());
    loadUpdateStatus.mockResolvedValue(privateRepo);
    refreshUpdateStatus.mockResolvedValue(privateRepo);
  });

  it('names why the update check stays silent instead of showing nothing', async () => {
    const wrapper = await mountView();
    const text = wrapper.text();
    // The exact confusion this section exists for: a private repository needs a token.
    expect(text).toContain('Das Repository ist privat');
    expect(text).toContain('0.10.0');
    wrapper.unmount();
  });

  it('reports the recorded result of the last send, including the server message', async () => {
    const wrapper = await mountView();
    const text = wrapper.text();
    expect(text).toContain('Letzter Versand fehlgeschlagen');
    expect(text).toContain('Invalid login: 535 nope');
    wrapper.unmount();
  });

  it('submitting an empty token field does not clear the stored token', async () => {
    loadSettings.mockResolvedValue(
      snapshot({
        settings: snapshot().settings.map((entry) =>
          entry.key === 'updateCheck.token' ? { ...entry, isSet: true } : entry,
        ),
      }),
    );
    const wrapper = await mountView();

    // Enter in the empty field submits the form even though the button is
    // disabled; an empty secret would be read as "clear it".
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(saveSettings).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('sends the password only when one was typed', async () => {
    const wrapper = await mountView();
    const forms = wrapper.findAll('form');
    const mailForm = forms[forms.length - 1];
    expect(mailForm).toBeDefined();

    await mailForm!.trigger('submit');
    await flushPromises();
    expect(Object.hasOwn(saveSettings.mock.calls[0]?.[0] ?? {}, 'mail.password')).toBe(false);

    const passwordInput = wrapper.findAll('input[type="password"]')[1];
    expect(passwordInput).toBeDefined();
    await passwordInput!.setValue('hunter2');
    await mailForm!.trigger('submit');
    await flushPromises();
    expect(saveSettings.mock.calls[1]?.[0]?.['mail.password']).toBe('hunter2');
    wrapper.unmount();
  });

  it('warns when the encryption key is missing', async () => {
    loadSettings.mockResolvedValue(snapshot({ encryptionAvailable: false }));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('CONFIG_ENCRYPTION_KEY');
    wrapper.unmount();
  });

  it('folds a section away and says so to assistive technology', async () => {
    const wrapper = await mountView();
    const toggle = wrapper.find('button[aria-expanded]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-controls')).toBeTruthy();

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await mountView(true);
    const options = {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    };

    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);

    // Collapsed as well: the hidden region must not leave dangling references.
    await wrapper.find('button[aria-expanded]').trigger('click');
    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);
    wrapper.unmount();
  });
});
