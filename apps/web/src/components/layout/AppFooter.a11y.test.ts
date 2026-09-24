import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../../lib/api';
import { resetAppInfo } from '../../lib/app-info';
import { request } from '../../lib/http';
import { useAuthStore } from '../../stores/auth';
import AppFooter from './AppFooter.vue';

vi.mock('../../lib/http', () => ({ request: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

const requestMock = vi.mocked(request);
const apiFetchMock = vi.mocked(apiFetch);

/** The API's update-check envelope, defaulting to "a newer release exists". */
function updateResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      current: '0.9.0',
      latest: '1.0.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/MagicOizo/eunomia/releases/tag/v1.0.0',
      status: 'ok',
      ...overrides,
    },
  };
}

/** Grants the permission the admin-only nav (and this footer) checks for. */
function signInAsAdmin(): void {
  useAuthStore().permissions = { global: ['MANAGE_USERS'], perAccount: [] };
}

describe('AppFooter', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // The version request is shared with the browser title and answered once
    // per page load, so each case has to start from an unasked state.
    resetAppInfo();
    requestMock.mockResolvedValue({ version: '0.9.0', environment: 'production' });
  });

  it('shows the backend version', async () => {
    const wrapper = mount(AppFooter);
    await flushPromises();

    expect(wrapper.text()).toContain('Backend v0.9.0');
    wrapper.unmount();
  });

  it('links to the release notes when a newer version exists', async () => {
    apiFetchMock.mockResolvedValue(updateResponse());
    signInAsAdmin();

    const wrapper = mount(AppFooter);
    await flushPromises();

    const link = wrapper.get('a');
    expect(link.text()).toContain('v1.0.0 verfügbar');
    expect(link.attributes('href')).toBe(
      'https://github.com/MagicOizo/eunomia/releases/tag/v1.0.0',
    );
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener');
    // The visible text is a fragment; the label states the whole thing.
    expect(link.attributes('aria-label')).toContain('Version 1.0.0 ist verfügbar');
    wrapper.unmount();
  });

  it('stays quiet when the instance is up to date', async () => {
    apiFetchMock.mockResolvedValue(updateResponse({ latest: '0.9.0', updateAvailable: false }));
    signInAsAdmin();

    const wrapper = mount(AppFooter);
    await flushPromises();

    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays quiet when the check could not reach GitHub', async () => {
    apiFetchMock.mockResolvedValue(
      updateResponse({
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        status: 'unavailable',
      }),
    );
    signInAsAdmin();

    const wrapper = mount(AppFooter);
    await flushPromises();

    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays quiet — and asks nothing — for a non-admin', async () => {
    const wrapper = mount(AppFooter);
    await flushPromises();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('swallows a failing update check', async () => {
    apiFetchMock.mockRejectedValue(new Error('403'));
    signInAsAdmin();

    const wrapper = mount(AppFooter);
    await flushPromises();

    expect(wrapper.text()).toContain('Backend v0.9.0');
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    apiFetchMock.mockResolvedValue(updateResponse());
    signInAsAdmin();

    const wrapper = mount(AppFooter, { attachTo: document.body });
    await flushPromises();

    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
