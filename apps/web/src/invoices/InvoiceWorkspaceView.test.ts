import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { grant } from '../test/permissions';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';
import InvoiceFormDialog from './InvoiceFormDialog.vue';
import InvoiceWorkspaceView from './InvoiceWorkspaceView.vue';
import PaymentInfoPopover from './PaymentInfoPopover.vue';

const { apiData, listResource, listInvoices, listInvoiceYears, reimbursementPlan } = vi.hoisted(
  () => ({
    apiData: vi.fn(),
    listResource: vi.fn(),
    listInvoices: vi.fn(),
    listInvoiceYears: vi.fn(),
    reimbursementPlan: vi.fn(),
  }),
);

vi.mock('../lib/api', () => ({ apiData }));
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
    apiData.mockResolvedValue({ firstname: 'John', surname: 'Doe' });
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
    directPayment: false,
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
    apiData.mockResolvedValue({ firstname: 'Anna', surname: 'Muster' });
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

/**
 * The agency's payment details are read in three places at once — the popover of
 * every row, the create form and the display mask — and each gets them as a prop
 * from here. Those props are optional or loosely typed at the mount boundary, so
 * a wrong name would not fail the compiler: the popover would simply show no
 * IBAN, and the pickers would offer nothing. Hence a test that names all three.
 */
describe('InvoiceWorkspaceView hands the payment details down', () => {
  const details = [
    {
      agencyAccountUID: 'g-1',
      bankAccount: 'DE02120300000000202051',
      bic: null,
      recipientName: null,
      note: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    apiData.mockResolvedValue({ firstname: 'Anna', surname: 'Muster' });
    listResource.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/agencies'
          ? [{ agencyUID: 'agy-1', agencyName: 'Inkasso Nord', accounts: details }]
          : [],
      ),
    );
    listInvoiceYears.mockResolvedValue([2026]);
    listInvoices.mockResolvedValue([
      { ...invoice('inv-1', 'R-2026-1', '2026-01-05'), agencyUID: 'agy-1' },
    ]);
    reimbursementPlan.mockResolvedValue(null);
  });

  it("gives the row popover the details of that invoice's agency", async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(wrapper.findComponent(PaymentInfoPopover).props('paymentDetails')).toEqual(details);
    wrapper.unmount();
  });

  it('gives both masks the map of every agency, for their pickers', async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const expected = { 'agy-1': details };
    expect(wrapper.findComponent(InvoiceFormDialog).props('agencyPaymentDetails')).toEqual(
      expected,
    );
    expect(wrapper.findComponent(InvoiceDetailDialog).props('agencyPaymentDetails')).toEqual(
      expected,
    );
    wrapper.unmount();
  });
});

// issues.md 0.12.0-6: where an excess or a deductible ate into the
// reimbursement, the column has to say so at a glance.
describe('InvoiceWorkspaceView reimbursement column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiData.mockResolvedValue({ firstname: 'Anna', surname: 'Muster' });
    listResource.mockResolvedValue([]);
    listInvoiceYears.mockResolvedValue([2026]);
    reimbursementPlan.mockResolvedValue(null);
  });

  /** The reimbursement cell of every row, in table order. */
  const cells = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('tbody tr td.eu-ws__num');

  it('separates a closed shortfall, a running one and a covered invoice', async () => {
    listInvoices.mockResolvedValue([
      // Sorted by invoice date descending, which is the order asserted below.
      {
        ...invoice('inv-short', 'R-2026-3', '2026-03-01'),
        workflowStatus: 'abgerechnet',
        reimbursementClosed: true,
        allocationCount: 1,
        reimbursedTotal: 60,
        remainingAmount: 40,
      },
      {
        ...invoice('inv-pending', 'R-2026-2', '2026-02-01'),
        workflowStatus: 'teilabgerechnet',
        allocationCount: 1,
        reimbursedTotal: 70,
        remainingAmount: 30,
      },
      {
        ...invoice('inv-full', 'R-2026-1', '2026-01-01'),
        workflowStatus: 'erledigt',
        allocationCount: 1,
        reimbursedTotal: 100,
        remainingAmount: 0,
      },
    ]);
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const [short, pending, full] = cells(wrapper);
    expect(short.classes()).toContain('is-short');
    expect(short.attributes('title')).toBe('Nicht vollständig erstattet – Eigenanteil 40,00 €');
    expect(pending.classes()).toContain('is-pending');
    expect(pending.attributes('title')).toBe('Noch nicht vollständig erstattet – offen 30,00 €');
    expect(full.classes()).toContain('is-covered');
    expect(full.attributes('title')).toBeUndefined();
    // The colour never carries it alone: the sentence is in the cell as well.
    expect(short.find('.eu-visually-hidden').text()).toContain('Eigenanteil');
    expect(full.find('.eu-visually-hidden').exists()).toBe(false);
    wrapper.unmount();
  });

  it('says nothing about an invoice nobody has answered yet', async () => {
    listInvoices.mockResolvedValue([invoice('inv-open', 'R-2026-9', '2026-05-05')]);
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(cells(wrapper)[0].classes()).toContain('is-covered');
    wrapper.unmount();
  });
});

/**
 * The row's document button is the other sink for a stored link: it opens one
 * in a new window. The schemas refuse anything but http(s) and migration 017
 * cleared the stock — this is the second line (SEC-01).
 */
describe('InvoiceWorkspaceView document button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiData.mockResolvedValue({ firstname: 'Anna', surname: 'Muster' });
    listResource.mockResolvedValue([]);
    listInvoiceYears.mockResolvedValue([2026]);
    reimbursementPlan.mockResolvedValue(null);
  });

  const openWorkspace = async (documentLink: string) => {
    listInvoices.mockResolvedValue([
      { ...invoice('inv-1', 'R-2026-1', '2026-01-01'), documentLink },
    ]);
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    return wrapper;
  };

  const documentButton = (wrapper: ReturnType<typeof mount>) =>
    wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Dokument öffnen');

  it('opens an http(s) document', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const wrapper = await openWorkspace('https://docs.example/r-1.pdf');

    await documentButton(wrapper)?.trigger('click');
    expect(open).toHaveBeenCalledWith('https://docs.example/r-1.pdf', '_blank', 'noopener');
    wrapper.unmount();
  });

  it('offers no button for a link a browser would execute, and opens nothing', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const wrapper = await openWorkspace('javascript:alert(document.domain)');

    expect(documentButton(wrapper)).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

/**
 * What the workspace offers a user who may read this person's invoices but not
 * write them (CR-26). Every test starts as a global admin (src/test/setup.ts),
 * so the restricted case says here what the user holds.
 */
describe('InvoiceWorkspaceView permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiData.mockResolvedValue({ firstname: 'John', surname: 'Doe' });
    listResource.mockResolvedValue([]);
    listInvoiceYears.mockResolvedValue([2026]);
    listInvoices.mockResolvedValue([invoice('i-1', 'R-1', '2026-03-01')]);
    reimbursementPlan.mockResolvedValue(null);
  });

  const openWorkspace = async () => {
    const wrapper = mount(InvoiceWorkspaceView, {
      props: { accountUID: 'a-1' },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    return wrapper;
  };

  /** The four buttons of the toolbar, by the text they carry. */
  const toolbarButton = (wrapper: ReturnType<typeof mount>, label: string) =>
    wrapper.findAll('.eu-ws__toolbar button').find((button) => button.text().startsWith(label));

  it('disables every write of the page, and says why', async () => {
    grant({ perAccount: [{ accountUID: 'a-1', permissionKey: 'VIEW_INVOICES' }] });
    const wrapper = await openWorkspace();

    for (const label of ['Neue Rechnung', 'Einreichen', 'Abrechnung zuordnen', 'Löschen']) {
      const button = toolbarButton(wrapper, label);
      expect(button?.attributes('disabled'), label).toBeDefined();
      expect(button?.attributes('title'), label).toBe('Dazu fehlt dir die Berechtigung.');
    }
    // The row keeps what reading allows and loses the rest.
    const rowLabels = wrapper
      .findAll('tbody button')
      .filter((button) => button.attributes('disabled') !== undefined)
      .map((button) => button.attributes('aria-label'));
    expect(rowLabels).toContain('Löschen');
    wrapper.unmount();
  });

  it('offers the writes again with the permission for this account', async () => {
    grant({
      perAccount: [
        { accountUID: 'a-1', permissionKey: 'VIEW_INVOICES' },
        { accountUID: 'a-1', permissionKey: 'MANAGE_INVOICES' },
      ],
    });
    const wrapper = await openWorkspace();

    expect(toolbarButton(wrapper, 'Neue Rechnung')?.attributes('disabled')).toBeUndefined();
    // The selection buttons stay disabled until something is selected — that is
    // their own rule, and it must not be mistaken for a missing permission.
    expect(toolbarButton(wrapper, 'Einreichen')?.attributes('title')).toBeUndefined();
    wrapper.unmount();
  });

  it('withholds the writes for a grant on another account', async () => {
    grant({
      perAccount: [
        { accountUID: 'a-1', permissionKey: 'VIEW_INVOICES' },
        { accountUID: 'a-2', permissionKey: 'MANAGE_INVOICES' },
      ],
    });
    const wrapper = await openWorkspace();

    expect(toolbarButton(wrapper, 'Neue Rechnung')?.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
