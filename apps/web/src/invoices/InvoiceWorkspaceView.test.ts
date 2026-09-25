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
