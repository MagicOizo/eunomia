import { OIDC_TEST_FAILURES } from '@eunomia/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EuTextField from '../design-system/components/EuTextField.vue';
import { HttpError } from '../lib/http';
import type { SettingWrite, SettingsSnapshot } from './settings-api';

/**
 * The sign-in section (Slice 87). What it must get right beyond a form: an
 * untouched secret never reaches the server (as with the mail password), the
 * connection test only runs against what is saved, every cause code of a failed
 * test reads as a sentence, and the redirect URI shown for copying is exactly
 * the one the callback route answers on.
 */

const saveSettings = vi.fn<(values: SettingWrite) => Promise<SettingsSnapshot>>();
const loadSettings = vi.fn<() => Promise<SettingsSnapshot>>();
const testLoginConnection = vi.fn<() => Promise<unknown>>();

vi.mock('./settings-api', () => ({
  saveSettings: (values: SettingWrite): Promise<SettingsSnapshot> => saveSettings(values),
  loadSettings: (): Promise<SettingsSnapshot> => loadSettings(),
  testLoginConnection: (): Promise<unknown> => testLoginConnection(),
}));

const { default: LoginSection } = await import('./LoginSection.vue');

interface Fixture {
  secretStored?: boolean;
  appUrl?: string | null;
  result?: 'ok' | 'error' | null;
  cause?: string | null;
  detail?: string | null;
  oidcEnabled?: boolean;
  passwordEnabled?: boolean;
  forced?: boolean;
}

/** A configured provider; placeholders only — the repository is public. */
function snapshot({
  secretStored = true,
  appUrl = 'https://eunomia.example.com/',
  result = null,
  cause = null,
  detail = null,
  oidcEnabled = false,
  passwordEnabled = true,
  forced = false,
}: Fixture = {}): SettingsSnapshot {
  const entry = (
    key: string,
    value: string | number | boolean | null,
    { isSecret = false, readonly = false, isSet = value !== null } = {},
  ) => ({
    key,
    section: key.startsWith('general.') ? ('general' as const) : ('login' as const),
    isSecret,
    readonly,
    value,
    isSet,
  });
  return {
    encryptionAvailable: true,
    passwordLoginForced: forced,
    mailStatus: { lastSendAt: null, lastSendResult: null, lastSendError: null },
    settings: [
      entry('general.appUrl', appUrl),
      entry('login.oidcEnabled', oidcEnabled),
      entry('login.passwordEnabled', passwordEnabled),
      entry('login.oidcIssuer', 'https://login.example.com/application/o/eunomia/'),
      entry('login.oidcClientId', 'eunomia'),
      entry('login.oidcClientSecret', null, { isSecret: true, isSet: secretStored }),
      entry('login.oidcButtonLabel', null),
      entry('login.oidcLastTestAt', result ? '2026-11-16T10:00:00.000Z' : null, { readonly: true }),
      entry('login.oidcLastTestResult', result, { readonly: true }),
      entry('login.oidcLastTestError', cause, { readonly: true }),
      entry('login.oidcLastTestDetail', detail, { readonly: true }),
    ],
  };
}

function mountSection(fixture: Fixture = {}) {
  return mount(LoginSection, { props: { snapshot: snapshot(fixture) } });
}

type Wrapper = ReturnType<typeof mountSection>;

function field(wrapper: Wrapper, label: string) {
  const found = wrapper
    .findAllComponents(EuTextField)
    .find((candidate) => candidate.props('label') === label);
  if (!found) throw new Error(`no field labelled ${label}`);
  return found.find('input');
}

function button(wrapper: Wrapper, text: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text().includes(text));
}

async function save(wrapper: Wrapper): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  saveSettings.mockImplementation(() => Promise.resolve(snapshot()));
  loadSettings.mockImplementation(() => Promise.resolve(snapshot()));
  testLoginConnection.mockResolvedValue({ status: {} });
});

describe('LoginSection client secret', () => {
  it('leaves the stored secret alone when the field was not touched', async () => {
    const wrapper = mountSection();
    await save(wrapper);

    const values = saveSettings.mock.calls[0][0];
    expect('login.oidcClientSecret' in values).toBe(false);
    expect(values['login.oidcIssuer']).toBe('https://login.example.com/application/o/eunomia/');
    expect(values['login.oidcClientId']).toBe('eunomia');
    // Readonly status keys are the test's to write, never the form's.
    expect(Object.keys(values).some((key) => key.includes('LastTest'))).toBe(false);
  });

  it('sends the secret that was typed', async () => {
    const wrapper = mountSection();
    await field(wrapper, 'Client-Secret').setValue('s3cret');
    await save(wrapper);

    expect(saveSettings.mock.calls[0][0]['login.oidcClientSecret']).toBe('s3cret');
  });

  it('forgets the stored secret only when asked to, and asks for nothing else', async () => {
    const wrapper = mountSection();
    await button(wrapper, 'Secret entfernen')?.trigger('click');
    await flushPromises();

    expect(saveSettings).toHaveBeenCalledWith({ 'login.oidcClientSecret': null });
  });

  it('offers no removal while nothing is stored', () => {
    const wrapper = mountSection({ secretStored: false });
    expect(button(wrapper, 'Secret entfernen')).toBeUndefined();
    expect(wrapper.text()).toContain('Noch kein Secret hinterlegt.');
  });
});

describe('LoginSection issuer', () => {
  it.each([
    'http://login.example.com/application/o/eunomia/',
    'https://login.example.com/application/o/eunomia/.well-known/openid-configuration',
    'login.example.com',
  ])('refuses to save %s', async (issuer) => {
    const wrapper = mountSection();
    await field(wrapper, 'Issuer-URL').setValue(issuer);
    await save(wrapper);

    expect(saveSettings).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Bitte eine https-Adresse des Issuers angeben');
  });

  it('an empty issuer is a valid write — the server judges completeness', async () => {
    const wrapper = mountSection();
    await field(wrapper, 'Issuer-URL').setValue('');
    await save(wrapper);

    expect(saveSettings.mock.calls[0][0]['login.oidcIssuer']).toBe('');
  });

  it('names the missing settings when the server refuses to switch on', async () => {
    saveSettings.mockRejectedValue(
      new HttpError(400, 'LOGIN_CONFIG_INCOMPLETE', 'incomplete', {
        missing: ['general.appUrl', 'login.oidcClientSecret'],
      }),
    );
    const wrapper = mountSection();
    await save(wrapper);

    expect(wrapper.find('[role="alert"]').text()).toContain('Client-Secret');
  });
});

describe('LoginSection connection test', () => {
  it('stays locked while the form holds unsaved changes', async () => {
    const wrapper = mountSection();
    expect(button(wrapper, 'Verbindung prüfen')?.attributes('disabled')).toBeUndefined();

    await field(wrapper, 'Client-ID').setValue('other');
    expect(button(wrapper, 'Verbindung prüfen')?.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Erst speichern, dann prüfen.');

    // Typing a secret counts as well: it is a change to the provider.
    await field(wrapper, 'Client-ID').setValue('eunomia');
    await field(wrapper, 'Client-Secret').setValue('s3cret');
    expect(button(wrapper, 'Verbindung prüfen')?.attributes('disabled')).toBeDefined();

    // Saving hands back a snapshot; the page passes it down again, which
    // empties the secret field and unlocks the test.
    await save(wrapper);
    await wrapper.setProps({ snapshot: wrapper.emitted('snapshot')?.[0]?.[0] as SettingsSnapshot });
    expect(button(wrapper, 'Verbindung prüfen')?.attributes('disabled')).toBeUndefined();
  });

  it('runs the test and shows the recorded status it reloads', async () => {
    loadSettings.mockResolvedValue(snapshot({ result: 'ok' }));
    const wrapper = mountSection();
    await button(wrapper, 'Verbindung prüfen')?.trigger('click');
    await flushPromises();

    expect(testLoginConnection).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('snapshot')?.[0]?.[0]).toEqual(snapshot({ result: 'ok' }));
  });

  it('says what is missing when the configuration is incomplete', async () => {
    testLoginConnection.mockRejectedValue(
      new HttpError(409, 'LOGIN_CONFIG_INCOMPLETE', 'incomplete', {
        missing: ['login.oidcClientSecret'],
      }),
    );
    const wrapper = mountSection();
    await button(wrapper, 'Verbindung prüfen')?.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Für die Anmeldung über einen Anmeldedienst fehlt noch: Client-Secret.',
    );
  });

  it('shows a passed test in the section status', () => {
    const wrapper = mountSection({ result: 'ok' });
    expect(wrapper.text()).toContain('Verbindung geprüft');
  });

  it('shows that nothing was tested yet', () => {
    expect(mountSection().text()).toContain('Noch nicht geprüft');
  });

  it.each(Object.values(OIDC_TEST_FAILURES))(
    'phrases the cause %s and keeps the technical detail',
    (cause) => {
      const wrapper = mountSection({ result: 'error', cause, detail: 'getaddrinfo ENOTFOUND' });
      const text = wrapper.text();
      expect(text).toContain('Prüfung fehlgeschlagen');
      expect(text).not.toContain(cause);
      expect(text).toContain('Technische Meldung: getaddrinfo ENOTFOUND');
    },
  );

  it('still says something for a cause this version does not know', () => {
    const wrapper = mountSection({ result: 'error', cause: 'from_the_future' });
    expect(wrapper.text()).toContain('Die letzte Prüfung ist fehlgeschlagen.');
  });
});

describe('LoginSection redirect URI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is built from the stored instance address, trailing slash and all', () => {
    const wrapper = mountSection();
    expect(wrapper.find('code').text()).toBe(
      'https://eunomia.example.com/api/v1/auth/oidc/callback',
    );
  });

  it('points to the general section while there is no instance address', () => {
    const wrapper = mountSection({ appUrl: null });
    expect(wrapper.find('code').exists()).toBe(false);
    expect(wrapper.text()).toContain('Erst die Adresse der Instanz unter „Allgemein" eintragen');
  });

  it('copies exactly that line', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const wrapper = mountSection();
    await button(wrapper, 'Kopieren')?.trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('https://eunomia.example.com/api/v1/auth/oidc/callback');
    expect(wrapper.text()).toContain('Redirect-URI kopiert.');
  });

  it('selects the line for a manual copy when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    const wrapper = mount(LoginSection, {
      props: { snapshot: snapshot() },
      attachTo: document.body,
    });
    await button(wrapper, 'Kopieren')?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Kopieren ging nicht');
    expect(window.getSelection()?.toString()).toBe(
      'https://eunomia.example.com/api/v1/auth/oidc/callback',
    );
    wrapper.unmount();
  });
});

describe('LoginSection password switch (Slice 90)', () => {
  function passwordToggle(wrapper: Wrapper) {
    const found = wrapper
      .findAll('label.eu-toggle')
      .find((candidate) => candidate.text().includes('Anmeldung mit Passwort erlauben'));
    if (!found) throw new Error('no password toggle');
    return found.find('input');
  }

  it('sends the switch with the form', async () => {
    const wrapper = mountSection({ oidcEnabled: true, result: 'ok' });
    await passwordToggle(wrapper).setValue(false);
    await save(wrapper);

    expect(saveSettings.mock.calls[0][0]['login.passwordEnabled']).toBe(false);
  });

  it('will not close the password login while the provider is off', async () => {
    const wrapper = mountSection({ oidcEnabled: false, result: 'ok' });
    await passwordToggle(wrapper).setValue(false);

    expect(wrapper.text()).toContain('Erst den Anmeldedienst einschalten');
    await save(wrapper);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('asks for a green test of the saved provider before the first close', async () => {
    const wrapper = mountSection({ oidcEnabled: true, result: 'error' });
    await passwordToggle(wrapper).setValue(false);

    expect(wrapper.text()).toContain('erfolgreich geprüft sein');
    // The test itself stays reachable: the switch is no change to the provider.
    expect(button(wrapper, 'Verbindung prüfen')?.attributes('disabled')).toBeUndefined();
    await save(wrapper);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('counts an unsaved change to the provider as untested', async () => {
    const wrapper = mountSection({ oidcEnabled: true, result: 'ok' });
    await passwordToggle(wrapper).setValue(false);
    expect(wrapper.text()).not.toContain('erfolgreich geprüft sein');

    await field(wrapper, 'Client-ID').setValue('other');
    expect(wrapper.text()).toContain('erfolgreich geprüft sein');
  });

  it('keeps a closed door repairable with a red test, and lets it open again', async () => {
    const wrapper = mountSection({ oidcEnabled: true, passwordEnabled: false, result: 'error' });
    await field(wrapper, 'Client-ID').setValue('fixed');
    await save(wrapper);
    expect(saveSettings.mock.calls[0][0]['login.passwordEnabled']).toBe(false);

    const reopened = mountSection({ oidcEnabled: false, passwordEnabled: false });
    expect(reopened.text()).toContain('Erst den Anmeldedienst einschalten');
    await passwordToggle(reopened).setValue(true);
    expect(reopened.text()).not.toContain('Erst den Anmeldedienst einschalten');
  });

  it('says so when PASSWORD_LOGIN_FORCE holds the door open', () => {
    expect(mountSection({ forced: true }).text()).toContain('PASSWORD_LOGIN_FORCE');
    expect(mountSection().text()).not.toContain('PASSWORD_LOGIN_FORCE');
  });
});
