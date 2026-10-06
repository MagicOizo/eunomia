import { RouterLinkStub, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { withLocale } from '../../test/locale';
import AppSidebar from './AppSidebar.vue';

function mountSidebar() {
  return mount(AppSidebar, {
    props: { open: true },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

const entries = (wrapper: ReturnType<typeof mountSidebar>): string[] =>
  wrapper.findAll('.eu-sidebar__nav a').map((link) => link.text());

describe('AppSidebar', () => {
  it('names the areas from the catalogue', () => {
    const wrapper = mountSidebar();

    expect(entries(wrapper)).toContain('Abrechnungsdienstleister');
    expect(entries(wrapper)).toContain('Nutzer & Rechte');
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Hauptnavigation');
  });

  it('speaks English with the English catalogue, in the glossary’s words', async () => {
    await withLocale('en', async () => {
      const wrapper = mountSidebar();

      expect(entries(wrapper)).toEqual([
        'Home',
        'Invoices',
        'Insured persons',
        'Policies',
        'Insurers',
        'Providers',
        'Billing agencies',
        'Service billings',
        'Users & permissions',
        'Trash',
        'Settings',
      ]);
      expect(wrapper.find('nav').attributes('aria-label')).toBe('Main navigation');
      expect(wrapper.find('.eu-sidebar__logout').text()).toBe('Sign out');
    });
  });
});
