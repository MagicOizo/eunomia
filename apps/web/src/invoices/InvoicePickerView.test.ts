import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InvoicePickerView from './InvoicePickerView.vue';

const { listResource, searchInvoicesByNumber } = vi.hoisted(() => ({
  listResource: vi.fn(),
  searchInvoicesByNumber: vi.fn(),
}));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchInvoicesByNumber,
}));
// The search is debounced in the running app; here it runs straight away.
vi.mock('../lib/debounce', () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}));

const accounts = [
  { accountUID: 'a-1', firstname: 'Anna', surname: 'Muster', birthDate: '1980-05-02' },
];

const hit = {
  invoiceUID: 'inv-1',
  invoiceNumber: 'R-2024-100',
  treatmentDate: '2024-03-14',
  treatmentDates: ['2024-03-14', '2024-03-21'],
  accountUID: 'a-1',
  invoiceAmount: 248.5,
  workflowStatus: 'abgerechnet',
};

async function mountView() {
  const wrapper = mount(InvoicePickerView, {
    // Renders the target as href, so a hit's link can be read off the DOM.
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  });
  await flushPromises();
  return wrapper;
}

describe('InvoicePickerView invoice-number search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResource.mockResolvedValue(accounts);
    searchInvoicesByNumber.mockResolvedValue([hit]);
  });

  it('does not search on a single character', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('R');
    await flushPromises();

    expect(searchInvoicesByNumber).not.toHaveBeenCalled();
    // The person tiles stay until a real search runs.
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(true);
  });

  it('shows the hit with its person and links to the year and the invoice', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('2024-100');
    await flushPromises();

    expect(searchInvoicesByNumber).toHaveBeenCalledWith('2024-100');
    const result = wrapper.findAll('.eu-picker__result');
    expect(result).toHaveLength(1);
    expect(result[0].text()).toContain('R-2024-100');
    expect(result[0].text()).toContain('Anna Muster');
    expect(result[0].attributes('href')).toBe('/invoices/a-1?year=2024&invoice=inv-1');
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);
  });

  it('says when no invoice carries that number', async () => {
    searchInvoicesByNumber.mockResolvedValue([]);
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('gibt-es-nicht');
    await flushPromises();

    expect(wrapper.text()).toContain('Keine Rechnung mit dieser Nummer.');
  });

  it('brings the person tiles back when the field is cleared', async () => {
    const wrapper = await mountView();
    await wrapper.find('.eu-picker__search input').setValue('2024-100');
    await flushPromises();
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);

    await wrapper.find('.eu-picker__search input').setValue('');
    await flushPromises();

    expect(wrapper.find('.eu-picker__grid').exists()).toBe(true);
  });
});
