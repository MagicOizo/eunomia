import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { useAuthStore } from '../stores/auth';
import { withLocale } from '../test/locale';
import LoginView from './LoginView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe('LoginView', () => {
  it('signs in in English with the English catalogue', async () => {
    await withLocale('en', async () => {
      const wrapper = mount(LoginView);

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
      const wrapper = mount(LoginView);
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe('Email or password is incorrect.');
    });
  });
});
