import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { useAuthStore } from '../stores/auth';
import type { ChangePasswordBody } from './api';

const changePassword = vi.fn<(body: ChangePasswordBody) => Promise<void>>();
vi.mock('./api', () => ({
  changePassword: (body: ChangePasswordBody): Promise<void> => changePassword(body),
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
  auth.user = { uuid: 'u-1', email: 'uwe@example.com', firstname: 'Uwe', surname: 'Ulm' };

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
