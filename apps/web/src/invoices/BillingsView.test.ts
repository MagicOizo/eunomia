import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { grant } from '../test/permissions';
import BillingDialog from './BillingDialog.vue';
import BillingsView from './BillingsView.vue';
import type { BillingDto, BillingListDto } from './api';

/**
 * Booking one insurer letter onto several invoices (CR-34). The page had no
 * test at all, and two rules about this path were written down nowhere:
 *
 *  - the reimbursements go out in ONE request, so the server can refuse them as
 *    a set — a letter that overpays one of three invoices must book none;
 *  - the bonus-forfeit flag is written afterwards and only when it differs from
 *    what the billing stores, so a refused booking leaves the billing untouched.
 */

const { apiData, listResource, searchBillings, createAllocations, updateBilling } = vi.hoisted(
  () => ({
    apiData: vi.fn(),
    listResource: vi.fn(),
    searchBillings: vi.fn(),
    createAllocations: vi.fn(),
    updateBilling: vi.fn(),
  }),
);

vi.mock('../lib/api', () => ({ apiData }));
vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  listResource,
}));
// `./billing-actions` stays real — the order of the two writes is the point.
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
  createAllocations,
  updateBilling,
}));

const CONTRACT = 'p-1';

const contract = {
  contractNumber: 'POL-1',
  companyName: 'Muster Versicherung',
  accountUID: 'a-1',
  bonusForfeitRule: 'ON_REIMBURSEMENT' as const,
};

const billing: BillingListDto = {
  billingUID: 's-1',
  contractUID: CONTRACT,
  billingDate: '2026-03-01',
  billingNumber: 'LA-1',
  documentLink: null,
  forfeitsBonus: null,
  objectionDate: null,
  objectionResolvedDate: null,
  objectionNote: null,
  accountUID: 'a-1',
  personName: 'Anna Muster',
  contractNumber: 'POL-1',
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  reimbursedTotal: 0,
  invoiceCount: 0,
  invoiceNumbers: null,
};

/** Two invoices answered by one letter — what the dialog hands over. */
const entries = [
  { invoiceUID: 'i-1', reimbursement: 120.5, receiptNumber: 'BN-1' },
  { invoiceUID: 'i-2', reimbursement: 80, receiptNumber: 'BN-2' },
];

/** What the page and the booking dialog inside it read. */
function mockApiData(): void {
  apiData.mockImplementation((path: string) => {
    if (path === `/contracts/${CONTRACT}`) return Promise.resolve(contract);
    if (path === '/accounts/a-1') return Promise.resolve({ firstname: 'Anna', surname: 'Muster' });
    // The dialog looks the insured person's invoices up itself.
    if (path.startsWith('/invoices')) return Promise.resolve([]);
    return Promise.resolve({});
  });
}

async function mountView() {
  const wrapper = mount(BillingsView, {
    props: { contractUID: CONTRACT },
    global: { stubs: { RouterLink: true } },
  });
  await flushPromises();
  return wrapper;
}

/**
 * Opens the booking dialog the way the page does it: a saved billing goes
 * straight on to booking its amounts (Slice 37). Without this the submit below
 * would be emitted at a closed dialog, and "it closed afterwards" would prove
 * nothing.
 */
async function openBooking(wrapper: Awaited<ReturnType<typeof mountView>>): Promise<void> {
  const forms = wrapper.findAllComponents({ name: 'BillingFormDialog' });
  forms[forms.length - 1].vm.$emit('saved', { ...billing });
  await flushPromises();
  expect(wrapper.findComponent(BillingDialog).props('open')).toBe(true);
}

/**
 * How often the PAGE read its list. The booking dialog searches the policy's
 * billings itself to fill its picker, so a bare call count would mix the two;
 * only the page passes the filter fields, `unlinked` among them.
 */
function listCalls(): number {
  return searchBillings.mock.calls.filter(([params]) => params && 'unlinked' in params).length;
}

/** Plays the booking dialog's submit, as a user who filled in two amounts does. */
async function book(
  wrapper: Awaited<ReturnType<typeof mountView>>,
  payload: { billingUID: string; entries: typeof entries; forfeitsBonus?: boolean },
): Promise<void> {
  wrapper.findComponent(BillingDialog).vm.$emit('submit', payload);
  await flushPromises();
}

describe('BillingsView: booking several invoices at once', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiData();
    listResource.mockResolvedValue([{ facilityUID: 'f-1', facilityName: 'Praxis Nord' }]);
    searchBillings.mockResolvedValue([billing]);
    createAllocations.mockResolvedValue(undefined);
    updateBilling.mockResolvedValue(undefined);
  });

  it('sends every reimbursement in one request and reloads the list', async () => {
    const wrapper = await mountView();
    expect(listCalls()).toBe(1);
    await openBooking(wrapper);

    await book(wrapper, { billingUID: 's-1', entries });

    expect(createAllocations).toHaveBeenCalledTimes(1);
    expect(createAllocations).toHaveBeenCalledWith('s-1', entries);
    // No forfeit flag was passed, so the billing itself is not touched.
    expect(updateBilling).not.toHaveBeenCalled();
    // The dialog is gone and the list behind it has been read again.
    expect(wrapper.findComponent(BillingDialog).props('open')).toBe(false);
    // Twice more: once for the created billing, once after the booking.
    expect(listCalls()).toBe(3);
  });

  it('hands a card’s closing mark to the booking itself, not to a second request', async () => {
    // issues.md 0.15.0-4: the mark travels with its entry, so a refused booking
    // cannot leave an invoice closed.
    const wrapper = await mountView();
    await openBooking(wrapper);
    const closing = [{ ...entries[0], reimbursementClosed: true as const }, entries[1]];

    await book(wrapper, { billingUID: 's-1', entries: closing });

    expect(createAllocations).toHaveBeenCalledWith('s-1', closing);
    expect(updateBilling).not.toHaveBeenCalled();
  });

  it('writes a changed bonus-forfeit flag only after the amounts went through', async () => {
    const wrapper = await mountView();
    await openBooking(wrapper);

    await book(wrapper, { billingUID: 's-1', entries, forfeitsBonus: true });

    expect(createAllocations).toHaveBeenCalledTimes(1);
    expect(updateBilling).toHaveBeenCalledWith('s-1', { forfeitsBonus: true });
    expect(createAllocations.mock.invocationCallOrder[0]).toBeLessThan(
      updateBilling.mock.invocationCallOrder[0],
    );
  });

  it('leaves the billing as it was when the booking is refused', async () => {
    const wrapper = await mountView();
    await openBooking(wrapper);
    createAllocations.mockRejectedValue(new Error('the reimbursements exceed the invoice amount'));

    await book(wrapper, { billingUID: 's-1', entries, forfeitsBonus: true });

    // The flag is the second write; a failed first one must not reach it.
    expect(updateBilling).not.toHaveBeenCalled();
    const dialog = wrapper.findComponent(BillingDialog);
    expect(dialog.props('open')).toBe(true);
    expect(dialog.props('error')).toBeTruthy();
    // Nothing changed, so nothing was reloaded on top of the create flow's own.
    expect(listCalls()).toBe(2);
  });

  it('offers no booking to someone who may not write this insured person’s invoices', async () => {
    grant({ perAccount: [{ accountUID: 'a-other', permissionKey: 'MANAGE_INVOICES' }] });
    const wrapper = await mountView();

    const create = wrapper.findAll('button').find((button) => button.text().includes('Neu'));
    expect(create?.attributes('disabled')).toBeDefined();
    expect(create?.attributes('title')).toBe('Dazu fehlt dir die Berechtigung.');
  });
});

/**
 * A new billing goes straight on to booking its amounts: the letter and the
 * reimbursements arrive together, so the two dialogs are one flow (Slice 37).
 */
describe('BillingsView: a new billing opens the booking dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiData();
    listResource.mockResolvedValue([]);
    searchBillings.mockResolvedValue([billing]);
  });

  it('hands the created billing to the dialog', async () => {
    const wrapper = await mountView();
    const created: BillingDto = { ...billing };

    // What BillingFormDialog emits once it saved.
    const forms = wrapper.findAllComponents({ name: 'BillingFormDialog' });
    forms[forms.length - 1].vm.$emit('saved', created);
    await flushPromises();

    const dialog = wrapper.findComponent(BillingDialog);
    expect(dialog.props('open')).toBe(true);
    expect(dialog.props('presetBilling')).toBe('s-1');
  });
});

/**
 * The billing search across every policy leads here with `?billing=` (issues.md
 * 0.15.0-5): the row it found is marked, focused and named as the one meant —
 * and only for as long as it answers that search.
 */
describe('BillingsView: the row a search led to', () => {
  const other: BillingListDto = { ...billing, billingUID: 's-2', billingNumber: 'LA-2' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiData();
    listResource.mockResolvedValue([]);
    searchBillings.mockResolvedValue([billing, other]);
  });

  async function mountFocused(focusBillingUID: string) {
    const wrapper = mount(BillingsView, {
      props: { contractUID: CONTRACT, focusBillingUID },
      global: { stubs: { RouterLink: true } },
      attachTo: document.body,
    });
    await flushPromises();
    return wrapper;
  }

  function markedRows(wrapper: Awaited<ReturnType<typeof mountFocused>>) {
    return wrapper.findAll('tbody tr').filter((row) => row.attributes('aria-current') === 'true');
  }

  it('marks and focuses exactly the found row', async () => {
    const wrapper = await mountFocused('s-2');

    const marked = markedRows(wrapper);
    expect(marked).toHaveLength(1);
    expect(marked[0].text()).toContain('LA-2');
    expect(marked[0].classes()).toContain('is-found');
    expect(document.activeElement).toBe(marked[0].element);
    wrapper.unmount();
  });

  it('marks nothing for a billing that is not on this policy', async () => {
    const wrapper = await mountFocused('s-elsewhere');

    expect(markedRows(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });

  it('lets go of the mark once the list is filtered', async () => {
    const wrapper = await mountFocused('s-1');
    expect(markedRows(wrapper)).toHaveLength(1);

    await wrapper.find('.eu-billings__search input').setValue('LA');

    expect(markedRows(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });
});
