import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InvoiceDetailDialog from './InvoiceDetailDialog.vue';
import InvoiceFormDialog from './InvoiceFormDialog.vue';
import InvoiceWorkspaceView from './InvoiceWorkspaceView.vue';

const { apiFetch, listResource, listInvoices, listInvoiceYears, reimbursementPlan } = vi.hoisted(
  () => ({
    apiFetch: vi.fn(),
    listResource: vi.fn(),
    listInvoices: vi.fn(),
    listInvoiceYears: vi.fn(),
    reimbursementPlan: vi.fn(),
  }),
);

vi.mock('../lib/api', () => ({ apiFetch }));
vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  listInvoices,
  listInvoiceYears,
  reimbursementPlan,
}));

/** Every facility the API knows; the second one appears only after it is created. */
const facilities = [{ facilityUID: 'f-1', facilityName: 'Praxis Nord' }];

describe('InvoiceWorkspaceView lookup lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilities.length = 1;
    apiFetch.mockResolvedValue({ data: { firstname: 'John', surname: 'Doe' } });
    listResource.mockImplementation((path: string) => {
      if (path === '/facilities') return Promise.resolve([...facilities]);
      if (path === '/agencies') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    listInvoiceYears.mockResolvedValue([2026]);
    listInvoices.mockResolvedValue([]);
    reimbursementPlan.mockResolvedValue(null);
  });

  it('reloads facilities and agencies when a dialog created one on the side', async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const listed = (path: string) => listResource.mock.calls.filter(([p]) => p === path).length;
    expect(listed('/facilities')).toBe(1);
    expect(wrapper.findComponent(InvoiceDetailDialog).props('facilities')).toEqual([
      { value: 'f-1', label: 'Praxis Nord' },
    ]);

    // What the create form does after its ad-hoc sub-dialog saved a facility.
    facilities.push({ facilityUID: 'f-9', facilityName: 'Praxis Süd' });
    wrapper.findComponent(InvoiceFormDialog).vm.$emit('entityCreated');
    await flushPromises();

    expect(listed('/facilities')).toBe(2);
    expect(listed('/agencies')).toBe(2);
    expect(wrapper.findComponent(InvoiceDetailDialog).props('facilities')).toContainEqual({
      value: 'f-9',
      label: 'Praxis Süd',
    });
    wrapper.unmount();
  });
});

/** Minimal invoice row: only what the table and the status badge need. */
function invoice(uid: string, number: string, treatmentDate: string) {
  return {
    invoiceUID: uid,
    invoiceNumber: number,
    invoiceDate: treatmentDate,
    treatmentDate,
    treatmentDates: [treatmentDate],
    accountUID: 'a-1',
    facilityUID: null,
    invoiceAmount: 100,
    transferUntilDate: null,
    transferDate: null,
    transferSubject: null,
    documentLink: null,
    agencyUID: null,
    directPayment: 0,
    reimbursementClosed: false,
    notCovered: false,
    notCoveredReason: null,
    reimbursedTotal: 0,
    allocationCount: 0,
    remainingAmount: 100,
    workflowStatus: 'offen',
    submissions: [],
    exclusions: [],
    hasOpenObjection: false,
  };
}

describe('InvoiceWorkspaceView arriving from the invoice-number search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ data: { firstname: 'Anna', surname: 'Muster' } });
    listResource.mockResolvedValue([]);
    listInvoiceYears.mockResolvedValue([2026, 2024]);
    listInvoices.mockImplementation((_account: string, year: number) =>
      Promise.resolve(
        year === 2024
          ? [
              invoice('inv-1', 'R-2024-100', '2024-03-14'),
              invoice('inv-2', 'R-2024-101', '2024-04-01'),
            ]
          : [invoice('inv-9', 'R-2026-1', '2026-01-05')],
      ),
    );
    reimbursementPlan.mockResolvedValue(null);
  });

  it('opens on the searched year and marks the searched invoice', async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1', focusYear: '2024', focusInvoiceUID: 'inv-2' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(listInvoices).toHaveBeenCalledWith('a-1', 2024);
    const marked = wrapper.findAll('tbody tr').filter((row) => row.classes('is-found'));
    expect(marked).toHaveLength(1);
    expect(marked[0].text()).toContain('R-2024-101');
    expect(marked[0].attributes('aria-current')).toBe('true');
    wrapper.unmount();
  });

  it('marks nothing without a search, and stays on the newest year', async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(listInvoices).toHaveBeenCalledWith('a-1', 2026);
    expect(wrapper.findAll('tbody tr.is-found')).toHaveLength(0);
    wrapper.unmount();
  });

  it('drops the mark when another year is chosen', async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1', focusYear: '2024', focusInvoiceUID: 'inv-2' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    expect(wrapper.findAll('tbody tr.is-found')).toHaveLength(1);

    await wrapper.findAll('.eu-ws__year')[0].trigger('click');
    await flushPromises();

    expect(wrapper.findAll('tbody tr.is-found')).toHaveLength(0);
    wrapper.unmount();
  });
});
