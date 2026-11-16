import type { LoginOptions } from '@eunomia/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { FALLBACK_LOGIN_OPTIONS, loadLoginOptions } from '../lib/login-options';
import { useAuthStore } from '../stores/auth';
import { withLocale } from '../test/locale';
import LoginView from './LoginView.vue';

const route = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));
const replace = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock('../lib/login-options', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/login-options')>()),
  loadLoginOptions: vi.fn(),
}));

function offering(options: LoginOptions): void {
  vi.mocked(loadLoginOptions).mockResolvedValue(options);
}

async function mounted() {
  const wrapper = mount(LoginView);
  await flushPromises();
  return wrapper;
}

describe('LoginView', () => {
  beforeEach(() => {
    route.query = {};
    replace.mockReset();
    offering(FALLBACK_LOGIN_OPTIONS);
  });

  it('signs in in English with the English catalogue', async () => {
    await withLocale('en', async () => {
      const wrapper = await mounted();

      expect(wrapper.text()).toContain('Managing private health insurance claims');
      expect(wrapper.find('button[type="submit"]').text()).toBe('Sign in');
      expect(wrapper.findAll('label').map((label) => label.text())).toEqual(['Email', 'Password']);
    });
  });

  it('says why a sign-in failed, in the language the page is in', async () => {
    await withLocale('en', async () => {
      vi.spyOn(useAuthStore(), 'login').mockRejectedValue(
        new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
      );
      const wrapper = await mounted();
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe('Email or password is incorrect.');
    });
  });

  describe('the way through the sign-in provider', () => {
    it('shows no button while the API offers none', async () => {
      const wrapper = await mounted();

      expect(wrapper.find('a').exists()).toBe(false);
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('is a plain link to the start of the flow, under the form, with the default text', async () => {
      await withLocale('en', async () => {
        offering({ password: true, oidc: { label: null } });
        const wrapper = await mounted();

        const link = wrapper.get('a');
        expect(link.attributes('href')).toBe('/api/v1/auth/oidc/start');
        expect(link.text()).toBe('Sign in with single sign-on');
        expect(link.classes()).toContain('eu-button--secondary');
        expect(wrapper.text()).toContain('or');
      });
    });

    it('carries the label the administrator chose', async () => {
      offering({ password: true, oidc: { label: 'Firmen-Login' } });
      const wrapper = await mounted();

      expect(wrapper.get('a').text()).toBe('Firmen-Login');
    });

    it('stands alone, as the primary action, when the password form is closed', async () => {
      offering({ password: false, oidc: { label: null } });
      const wrapper = await mounted();

      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.find('.eu-login__or').exists()).toBe(false);
      expect(wrapper.get('a').classes()).toContain('eu-button--primary');
    });

    it('turns the code from the way back into a sentence and takes it out of the address', async () => {
      await withLocale('en', async () => {
        route.query = { oidcError: 'no_account', redirect: '/invoices' };
        const wrapper = await mounted();

        expect(wrapper.get('[role="alert"]').text()).toBe(
          'There is no account here for this sign-in. Please ask an administrator.',
        );
        expect(replace).toHaveBeenCalledWith({ query: { redirect: '/invoices' } });
      });
    });

    it('still says something for a code it does not know', async () => {
      await withLocale('en', async () => {
        route.query = { oidcError: 'something_new' };
        const wrapper = await mounted();

        expect(wrapper.get('[role="alert"]').text()).toBe('Signing in with single sign-on failed.');
      });
    });

    it('lets a password attempt replace the provider’s message', async () => {
      await withLocale('en', async () => {
        route.query = { oidcError: 'denied' };
        vi.spyOn(useAuthStore(), 'login').mockRejectedValue(
          new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
        );
        const wrapper = await mounted();
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual([
          'Email or password is incorrect.',
        ]);
      });
    });

    it('leaves the address alone when there is nothing to take out', async () => {
      await mounted();

      expect(replace).not.toHaveBeenCalled();
    });
  });
});
