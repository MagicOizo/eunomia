import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { settled } from '../test/settle';
import type { BillingListDto } from './api';
import BillingPickerView from './BillingPickerView.vue';

const { listResource, searchBillings } = vi.hoisted(() => ({
  listResource: vi.fn(),
  searchBillings: vi.fn(),
}));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../lib/debounce', () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}));

const hit: BillingListDto = {
  billingUID: 'SBL_1',
  contractUID: 'CON_2',
  billingDate: '2026-03-01',
  billingNumber: 'LA-2026-7',
  documentLink: null,
  forfeitsBonus: null,
  objectionDate: null,
  objectionResolvedDate: null,
  objectionNote: null,
  accountUID: 'a-2',
  personName: 'Ben Beispiel',
  contractNumber: 'POL-2',
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  reimbursedTotal: 80,
  invoiceCount: 1,
  invoiceNumbers: 'R-1',
};

describe('BillingPickerView', () => {
  it('has no automatically detectable accessibility violations with hits', async () => {
    listResource.mockResolvedValue([]);
    searchBillings.mockResolvedValue([hit]);
    const wrapper = mount(BillingPickerView, {
      props: { unlinked: '1' },
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
      attachTo: document.body,
    });
    await flushPromises();
    await settled(() => wrapper.findAll('.eu-picker__result').length > 0, 'the hit to render');

    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
