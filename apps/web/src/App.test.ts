import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import App from './App.vue';
import { router } from './router';

describe('App', () => {
  it('renders the login screen on the login route', async () => {
    const pinia = createPinia();
    setActivePinia(pinia); // the router guard reads the auth store before mount
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(App, { global: { plugins: [pinia, router] } });
    expect(wrapper.text()).toContain('Eunomia');
    expect(wrapper.text()).toContain('Anmelden');
  });
});
