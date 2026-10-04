import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settled } from '../test/settle';
import InvoicePickerView from './InvoicePickerView.vue';
import { EMPTY_FILTER, rememberFilter } from './invoice-search';

const { listResource, searchInvoices, replace } = vi.hoisted(() => ({
  listResource: vi.fn(),
  searchInvoices: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchInvoices,
}));
// The view writes the filter into the URL; here only the call is of interest.
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }));
// The search is debounced in the running app; here it runs straight away.
vi.mock('../lib/debounce', () => ({
  useDebouncedCallback: (callback: () => void) => callback,
}));

const accounts = [
  { accountUID: 'a-1', firstname: 'Anna', surname: 'Muster', birthDate: '1980-05-02' },
];

const agencies = [
  {
    agencyUID: 'AGY_1',
    agencyName: 'Inkasso Nord',
    bankAccount: 'DE02120300000000202051',
    bic: null,
    recipientName: null,
    accounts: [
      {
        agencyAccountUID: 'AGA_1',
        bankAccount: 'DE02120300000000202051',
        bic: null,
        recipientName: null,
        note: null,
      },
    ],
  },
  {
    agencyUID: 'AGY_2',
    agencyName: 'Inkasso Süd',
    bankAccount: 'DE89370400440532013000',
    bic: null,
    recipientName: null,
    accounts: [
      {
        agencyAccountUID: 'AGA_2',
        bankAccount: 'DE89370400440532013000',
        bic: null,
        recipientName: null,
        note: null,
      },
    ],
  },
];

const facilities = [{ facilityUID: 'FAC_1', facilityName: 'Praxis Süd' }];

const hit = {
  invoiceUID: 'inv-1',
  invoiceNumber: 'R-2024-100',
  invoiceDate: '2024-03-20',
  treatmentDate: '2024-03-14',
  treatmentDates: ['2024-03-14', '2024-03-21'],
  accountUID: 'a-1',
  facilityUID: 'FAC_1',
  agencyUID: 'AGY_1',
  agencyAccountUID: 'AGA_1',
  invoiceAmount: 248.5,
  workflowStatus: 'abgerechnet',
};

/** The master data the view loads, in the order it asks for it. */
function mockMasterData(): void {
  listResource.mockImplementation((path: string) => {
    if (path === '/accounts') return Promise.resolve(accounts);
    if (path === '/agencies') return Promise.resolve(agencies);
    return Promise.resolve(facilities);
  });
}

async function mountView(props: Record<string, string> = {}) {
  const wrapper = mount(InvoicePickerView, {
    props,
    // Renders the target as href, so a hit's link can be read off the DOM.
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  });
  await flushPromises();
  return wrapper;
}

/** The select of one filter, by its label. */
function selectFor(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  const field = wrapper
    .findAll('.eu-select-field')
    .find((candidate) => candidate.text().includes(label));
  if (!field) throw new Error(`no filter labelled ${label}`);
  return field.find('select');
}

describe('InvoicePickerView search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rememberFilter(EMPTY_FILTER);
    mockMasterData();
    searchInvoices.mockResolvedValue([hit]);
  });

  it('does not search on a single character', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('R');
    await flushPromises();

    expect(searchInvoices).not.toHaveBeenCalled();
    // The person tiles stay until a real search runs.
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(true);
  });

  it('shows the hit with its person and links to the year and the invoice', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('2024-100');
    // The search goes through a watcher and an await before anything renders,
    // so the rows are waited for, not assumed (see ../test/settle.ts).
    await settled(() => wrapper.findAll('.eu-picker__result').length > 0, 'the hit to render');

    expect(searchInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ q: '2024-100' }),
      expect.any(Number),
    );
    const result = wrapper.findAll('.eu-picker__result');
    expect(result).toHaveLength(1);
    expect(result[0].text()).toContain('R-2024-100');
    expect(result[0].text()).toContain('Anna Muster');
    expect(result[0].attributes('href')).toBe('/invoices/a-1?year=2024&invoice=inv-1');
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);
  });

  it('names provider, agency and bank account of a hit', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('2024-100');
    await settled(() => wrapper.find('.eu-picker__refs').exists(), "the hit's reference line");

    const refs = wrapper.find('.eu-picker__refs').text();
    expect(refs).toContain('Praxis Süd');
    expect(refs).toContain('Inkasso Nord');
    expect(refs).toContain('DE02 1203 0000 0000 2020 51');
  });

  it('searches for the agency the URL names, without a number', async () => {
    const wrapper = await mountView({ agency: 'AGY_1' });

    expect(searchInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ agencyUID: 'AGY_1', q: '' }),
      expect.any(Number),
    );
    await settled(() => wrapper.findAll('.eu-picker__result').length > 0, 'the hit to render');
    expect(wrapper.findAll('.eu-picker__result')).toHaveLength(1);
    // The agency is chosen in the filter row, so its accounts can be picked.
    expect(selectFor(wrapper, 'Abrechnungsdienstleister').element.value).toBe('AGY_1');
    expect(selectFor(wrapper, 'Kontoverbindung').attributes('disabled')).toBeUndefined();
  });

  it('searches for a provider chosen in the filter row', async () => {
    const wrapper = await mountView();

    await selectFor(wrapper, 'Leistungserbringer').setValue('FAC_1');
    await flushPromises();

    expect(searchInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ facilityUID: 'FAC_1' }),
      expect.any(Number),
    );
    expect(replace).toHaveBeenCalledWith({ query: { facility: 'FAC_1' } });
  });

  it('narrows a search by status', async () => {
    const wrapper = await mountView({ agency: 'AGY_1' });

    await selectFor(wrapper, 'Status').setValue('nicht-erledigt');
    await flushPromises();

    expect(searchInvoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ agencyUID: 'AGY_1', status: 'nicht-erledigt' }),
      expect.any(Number),
    );
  });

  it('keeps the bank account the URL names, and drops it on another agency', async () => {
    const wrapper = await mountView({ agency: 'AGY_1', account: 'AGA_1' });

    // What arrives together belongs together.
    expect(searchInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ agencyUID: 'AGY_1', agencyAccountUID: 'AGA_1' }),
      expect.any(Number),
    );

    await selectFor(wrapper, 'Abrechnungsdienstleister').setValue('AGY_2');
    await flushPromises();

    // The old account is not one of the new agency's.
    expect(searchInvoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ agencyUID: 'AGY_2', agencyAccountUID: '' }),
      expect.any(Number),
    );
  });

  it('picks up the last filter when the page is opened bare again', async () => {
    rememberFilter({ ...EMPTY_FILTER, agencyUID: 'AGY_1' });

    const wrapper = await mountView();

    expect(searchInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ agencyUID: 'AGY_1' }),
      expect.any(Number),
    );
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(false);
  });

  it('says when nothing matches', async () => {
    searchInvoices.mockResolvedValue([]);
    const wrapper = await mountView();

    await wrapper.find('.eu-picker__search input').setValue('gibt-es-nicht');
    await flushPromises();

    await settled(() => !wrapper.text().includes('Wird gesucht'), 'the search to come back');
    expect(wrapper.text()).toContain('Keine Rechnung passt zu dieser Suche.');
  });

  it('brings the person tiles back when the filter is cleared', async () => {
    const wrapper = await mountView();
    await wrapper.find('.eu-picker__search input').setValue('2024-100');
    await settled(() => !wrapper.find('.eu-picker__grid').exists(), 'the tiles to give way');

    await wrapper.find('.eu-picker__search input').setValue('');
    await settled(() => wrapper.find('.eu-picker__grid').exists(), 'the tiles to come back');
    expect(wrapper.find('.eu-picker__grid').exists()).toBe(true);
  });
});
