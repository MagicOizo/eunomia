import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingListDto, InvoiceDto, InvoiceSubmissionDto } from './api';
import BillingDialog from './BillingDialog.vue';

const { searchBillings, listAccountInvoices } = vi.hoisted(() => ({
  searchBillings: vi.fn(),
  listAccountInvoices: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
  listAccountInvoices,
}));

function submission(overrides: Partial<InvoiceSubmissionDto> = {}): InvoiceSubmissionDto {
  return {
    submissionUID: 'e-1',
    contractUID: 'c-1',
    contractNumber: 'X-1',
    companyName: 'PKV',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    submittedDate: '2025-03-04',
    billingCount: 0,
    reimbursed: 0,
    status: 'eingereicht',
    allocations: [],
    ...overrides,
  };
}

function invoice(number: string, overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceUID: `i-${number}`,
    invoiceNumber: number,
    invoiceDate: '2025-02-01',
    treatmentDate: '2025-01-15',
    accountUID: 'a-1',
    facilityUID: 'f-1',
    invoiceAmount: 400,
    transferUntilDate: null,
    transferDate: null,
    transferSubject: null,
    documentLink: null,
    agencyUID: null,
    directPayment: 0,
    reimbursementClosed: false,
    reimbursedTotal: 0,
    allocationCount: 0,
    remainingAmount: 400,
    workflowStatus: 'eingereicht',
    submissions: [submission()],
    exclusions: [],
    hasOpenObjection: false,
    ...overrides,
  };
}

const billing: BillingListDto = {
  billingUID: 'b-1',
  submissionUID: 'e-1',
  billingDate: '2025-04-01',
  billingNumber: 'LA-42',
  documentLink: null,
  forfeitsBonus: null,
  objectionDate: null,
  objectionResolvedDate: null,
  objectionNote: null,
  accountUID: 'a-1',
  contractUID: 'c-1',
  personName: 'Clara Beispiel',
  contractNumber: 'X-1',
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  reimbursedTotal: 0,
  invoiceCount: 0,
  invoiceNumbers: null,
};

/** Two invoices of the same submission — the bulk case. */
const invoices = [invoice('R-1'), invoice('R-2')];

async function openDialog(props: Partial<InstanceType<typeof BillingDialog>['$props']> = {}) {
  const wrapper = mount(BillingDialog, {
    props: {
      open: true,
      invoices,
      facilityNames: { 'f-1': 'Hausarztpraxis Dr. Beispiel' },
      submitting: false,
      error: null,
      ...props,
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  searchBillings.mockResolvedValue([billing]);
  listAccountInvoices.mockResolvedValue(invoices);
});

describe('BillingDialog with several invoices', () => {
  it('shows a card per invoice with its own amount field', async () => {
    const wrapper = await openDialog();
    const text = wrapper.text().replace(/\u00a0/g, ' ');

    expect(text).toContain('2 Rechnungen werden');
    expect(text).toContain('R-1');
    expect(text).toContain('R-2');
    expect(wrapper.findAll('.eu-bill__card')).toHaveLength(2);
    expect(text).toContain('Hausarztpraxis Dr. Beispiel');
    // The single existing billing is preselected, with its date shown read-only.
    expect(text).toContain('01.04.2025');
    wrapper.unmount();
  });

  it('asks for the missing amounts instead of sending an incomplete booking', async () => {
    const wrapper = await openDialog();
    const save = wrapper.findAll('button').find((b) => b.text() === 'Speichern');
    await save?.trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('R-1, R-2');
    wrapper.unmount();
  });

  it('refuses a booking without a shared submission', async () => {
    const wrapper = await openDialog({
      invoices: [
        invoice('R-1'),
        invoice('R-3', { submissions: [submission({ submissionUID: 'e-2' })] }),
      ],
    });
    expect(wrapper.text()).toContain('keine gemeinsame Einreichung');
    wrapper.unmount();
  });

  it('preselects the billing it was handed, even with several candidates', async () => {
    const second: BillingListDto = { ...billing, billingUID: 'b-2', billingNumber: 'LA-43' };
    searchBillings.mockResolvedValue([billing, second]);
    const wrapper = await openDialog({ presetBilling: 'b-2' });

    const picker = wrapper.find<HTMLInputElement>('input[role="combobox"]');
    // The dialog focuses its first field, and a focused picker shows the typed
    // query rather than the selected label.
    await picker.trigger('blur');
    expect(picker.element.value).toBe('LA-43');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await openDialog();
    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
