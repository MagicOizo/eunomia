import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { withLocale } from '../test/locale';
import { type AuthUser, useAuthStore } from '../stores/auth';
import type { ChangePasswordBody, LocalePreferencesBody } from './api';

const changePassword = vi.fn<(body: ChangePasswordBody) => Promise<void>>();
const updateLocalePreferences = vi.fn<(body: LocalePreferencesBody) => Promise<AuthUser>>();
vi.mock('./api', () => ({
  changePassword: (body: ChangePasswordBody): Promise<void> => changePassword(body),
  updateLocalePreferences: (body: LocalePreferencesBody): Promise<AuthUser> =>
    updateLocalePreferences(body),
}));

const { default: ProfileView } = await import('./ProfileView.vue');

/** The three password fields, in the order they are rendered. */
function fields(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('input[type="password"]');
}

async function mountView(attach = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = {
    uuid: 'u-1',
    email: 'uwe@example.com',
    firstname: 'Uwe',
    surname: 'Ulm',
    locale: null,
    formatRegion: null,
  };

  const wrapper = mount(ProfileView, {
    global: { plugins: [pinia] },
    ...(attach ? { attachTo: document.body } : {}),
  });
  await flushPromises();
  return wrapper;
}

/** Fills the form and submits it. */
async function fillAndSubmit(
  wrapper: ReturnType<typeof mount>,
  current: string,
  next: string,
  repeat: string,
): Promise<void> {
  const [currentField, newField, repeatField] = fields(wrapper);
  await currentField!.setValue(current);
  await newField!.setValue(next);
  await repeatField!.setValue(repeat);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('ProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changePassword.mockResolvedValue(undefined);
  });

  it('shows who is signed in', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Uwe Ulm');
    expect(wrapper.text()).toContain('uwe@example.com');
    wrapper.unmount();
  });

  it('says that the other sessions end, because that is the point of it', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('endet jede andere Sitzung');
    wrapper.unmount();
  });

  it('catches a mistyped repetition before sending anything', async () => {
    const wrapper = await mountView();
    await fillAndSubmit(wrapper, 'oldpass12', 'newpass123', 'newpass124');

    expect(changePassword).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Wiederholung stimmt nicht');
    wrapper.unmount();
  });

  it('catches a new password that is too short before sending anything', async () => {
    const wrapper = await mountView();
    await fillAndSubmit(wrapper, 'oldpass12', 'short', 'short');

    expect(changePassword).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('mindestens 8 Zeichen');
    wrapper.unmount();
  });

  it('sends the two passwords and clears the form afterwards', async () => {
    const wrapper = await mountView();
    await fillAndSubmit(wrapper, 'oldpass12', 'newpass123', 'newpass123');

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'oldpass12',
      newPassword: 'newpass123',
    });
    expect(wrapper.text()).toContain('Passwort geändert');
    // Nothing typed stays in the DOM once it was accepted.
    expect(fields(wrapper).map((field) => (field.element as HTMLInputElement).value)).toEqual([
      '',
      '',
      '',
    ]);
    wrapper.unmount();
  });

  it('answers a wrong current password in German', async () => {
    changePassword.mockRejectedValue(
      new HttpError(403, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect'),
    );
    const wrapper = await mountView();
    await fillAndSubmit(wrapper, 'guessed12', 'newpass123', 'newpass123');

    expect(wrapper.text()).toContain('Das aktuelle Passwort ist falsch.');
    // The typed values stay: the user corrects one field, not all three.
    expect((fields(wrapper)[1]!.element as HTMLInputElement).value).toBe('newpass123');
    wrapper.unmount();
  });

  it('stores a chosen language and puts the answer into the session', async () => {
    const wrapper = await mountView();
    const answered = { ...useAuthStore().user!, locale: 'en' };
    updateLocalePreferences.mockResolvedValue(answered);

    await wrapper.findAll('select')[0]!.setValue('en');
    await flushPromises();

    expect(updateLocalePreferences).toHaveBeenCalledWith({ locale: 'en' });
    expect(useAuthStore().user).toEqual(answered);
    expect(wrapper.text()).toContain('Gespeichert.');
    wrapper.unmount();
  });

  it('sends null for "automatic", so the profile follows again', async () => {
    const wrapper = await mountView();
    useAuthStore().user!.formatRegion = 'en-US';
    updateLocalePreferences.mockResolvedValue({ ...useAuthStore().user!, formatRegion: null });

    await wrapper.findAll('select')[1]!.setValue('');
    await flushPromises();

    expect(updateLocalePreferences).toHaveBeenCalledWith({ formatRegion: null });
    wrapper.unmount();
  });

  it('names the languages in themselves and shows a sample per format', async () => {
    await withLocale('en', async () => {
      const wrapper = await mountView();
      expect(wrapper.text()).toContain('Language and format');
      const options = wrapper.findAll('option').map((option) => option.text());
      expect(options).toContain('Deutsch');
      expect(options).toContain('English');
      expect(options).toContain('American (12/31/2026 · €1,234.56)');
      wrapper.unmount();
    });
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await mountView(true);
    const options = {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    };

    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);

    // With the field errors shown, so aria-describedby has something to point at.
    await fillAndSubmit(wrapper, 'oldpass12', 'short', 'other');
    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);
    wrapper.unmount();
  });
});
