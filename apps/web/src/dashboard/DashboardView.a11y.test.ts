import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardDto } from './api';
import { dashboardFixture } from './dashboard-fixture';

const { loadDashboard } = vi.hoisted(() => ({ loadDashboard: vi.fn() }));

vi.mock('./api', () => ({
  loadDashboard: (): Promise<DashboardDto> => loadDashboard(),
}));

const { default: DashboardView } = await import('./DashboardView.vue');

describe('DashboardView', () => {
  it('has no automatically detectable accessibility violations', async () => {
    loadDashboard.mockResolvedValue(dashboardFixture());
    const wrapper = mount(DashboardView, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
      attachTo: document.body,
    });
    await flushPromises();
    // The table of the year figures folds away; open it so axe checks it too.
    wrapper.find('details').element.setAttribute('open', '');

    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
