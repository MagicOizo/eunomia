import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settled } from '../test/settle';
import type { BillingListDto } from './api';
import BillingPickerView from './BillingPickerView.vue';
import { EMPTY_BILLING_FILTER, rememberFilter } from './billing-search';

/**
 * The billing search across every policy (issues.md 0.15.0-5): free text and
 * "nothing booked on it yet", the filter in the URL, a hit leading to its
 * policy with the row named.
 */

const { listResource, searchBillings, replace } = vi.hoisted(() => ({
  listResource: vi.fn(),
  searchBillings: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
}));
// The view writes the filter into the URL; here only the call is of interest.
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }));
// The search is debounced in the running app; here it runs straight away.
vi.mock('../lib/debounce', () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}));

const contracts = [
  { contractUID: 'CON_1', contractNumber: 'POL-1', companyName: 'Muster PKV', accountUID: 'a-1' },
];
const accounts = [{ accountUID: 'a-1', firstname: 'Anna', surname: 'Muster' }];

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
  reimbursedTotal: 0,
  invoiceCount: 0,
  invoiceNumbers: null,
};

async function mountView(props: Record<string, string> = {}) {
  const wrapper = mount(BillingPickerView, {
    props,
    // Renders the target as href, so a hit's link can be read off the DOM.
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('BillingPickerView search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rememberFilter(EMPTY_BILLING_FILTER);
    listResource.mockImplementation((path: string) =>
      Promise.resolve(path === '/contracts' ? contracts : accounts),
    );
    searchBillings.mockResolvedValue([hit]);
  });

  it('shows the policy tiles and searches nothing while nothing is asked', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('L');
    await flushPromises();

    expect(searchBillings).not.toHaveBeenCalled();
    expect(wrapper.find('.eu-picker__grid').text()).toContain('POL-1');
    wrapper.unmount();
  });

  it('lists the billings without allocations across every policy on the switch alone', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__toggle input').setValue(true);
    await settled(() => wrapper.findAll('.eu-picker__result').length > 0, 'the hit to render');

    // No policy is named: the question goes across all of them.
    expect(searchBillings).toHaveBeenCalledWith({ unlinked: true, limit: 50 });
    expect(replace).toHaveBeenCalledWith({ query: { unlinked: '1' } });
    const result = wrapper.find('.eu-picker__result');
    expect(result.text()).toContain('LA-2026-7');
    expect(result.text()).toContain('Ben Beispiel');
    expect(result.text()).toContain('POL-2');
    expect(result.text()).toContain('noch keiner Rechnung zugeordnet');
    expect(result.attributes('href')).toBe('/billings/CON_2?billing=SBL_1');
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);
    wrapper.unmount();
  });

  it('searches the free text the URL names', async () => {
    searchBillings.mockResolvedValue([
      { ...hit, reimbursedTotal: 80, invoiceCount: 2, invoiceNumbers: 'R-1, R-2' },
    ]);
    const wrapper = await mountView({ q: 'R-1' });

    expect(searchBillings).toHaveBeenCalledWith({ q: 'R-1', unlinked: false, limit: 50 });
    await settled(() => wrapper.find('.eu-picker__refs').exists(), "the hit's invoices");
    expect(wrapper.find('.eu-picker__refs').text()).toBe('R-1, R-2');
    expect(wrapper.find('.eu-picker__search input').element).toHaveProperty('value', 'R-1');
    wrapper.unmount();
  });

  it('picks up the last filter when the page is opened bare again', async () => {
    rememberFilter({ q: '', unlinked: true });

    const wrapper = await mountView();

    expect(searchBillings).toHaveBeenCalledWith({ unlinked: true, limit: 50 });
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);
    wrapper.unmount();
  });

  it('says when nothing matches', async () => {
    searchBillings.mockResolvedValue([]);
    const wrapper = await mountView({ q: 'gibt-es-nicht' });

    await settled(() => !wrapper.text().includes('Wird gesucht'), 'the search to come back');
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Keine Leistungsabrechnung passt zu dieser Suche.',
    );
    wrapper.unmount();
  });

  it('brings the policy tiles back when the filter is cleared', async () => {
    const wrapper = await mountView({ unlinked: '1' });
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);

    await wrapper.find('.eu-picker__toggle input').setValue(false);
    await settled(() => wrapper.find('.eu-picker__grid').exists(), 'the tiles to come back');
    wrapper.unmount();
  });
});
