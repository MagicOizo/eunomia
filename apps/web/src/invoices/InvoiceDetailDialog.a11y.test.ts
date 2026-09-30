import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EuDetailField from '../design-system/components/EuDetailField.vue';
import ResourceFormDialog from '../components/resource/ResourceFormDialog.vue';
import type { InvoiceDto, InvoiceSubmissionDto, PlanInvoiceDto } from './api';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';

const { createResource } = vi.hoisted(() => ({ createResource: vi.fn() }));

vi.mock('../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/resource')>()),
  createResource,
}));

function submission(overrides: Partial<InvoiceSubmissionDto> = {}): InvoiceSubmissionDto {
  return {
    submissionUID: 'e-x',
    contractUID: 'x',
    contractNumber: 'X-1',
    companyName: 'PKV',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    submittedDate: '2025-03-04',
    billingCount: 1,
    reimbursed: 800,
    status: 'abgerechnet',
    allocations: [
      {
        allocationUID: 'al-1',
        billingUID: 'b-1',
        billingNumber: 'LA-42',
        billingDate: '2025-04-01',
        receiptNumber: 'BEL-7',
        reimbursement: 800,
        objectionOpen: false,
      },
    ],
    ...overrides,
  };
}

const invoice: InvoiceDto = {
  invoiceUID: 'i-1',
  invoiceNumber: 'R-1',
  invoiceDate: '2025-02-01',
  treatmentDate: '2025-01-15',
  // Three days: the mask's list of further treatment days has rows to show.
  treatmentDates: ['2025-01-15', '2025-01-22', '2025-02-03'],
  accountUID: 'a-1',
  facilityUID: null,
  invoiceAmount: 1000,
  transferUntilDate: null,
  transferDate: null,
  transferSubject: null,
  documentLink: null,
  agencyUID: null,
  agencyAccountUID: null,
  directPayment: false,
  reimbursementClosed: false,
  notCovered: false,
  notCoveredReason: null,
  reimbursedTotal: 800,
  allocationCount: 1,
  remainingAmount: 200,
  workflowStatus: 'teilabgerechnet',
  submissions: [submission()],
  exclusions: [{ contractUID: 'z', contractNumber: 'Z-1', companyName: 'Zusatz', note: 'Brille' }],
  hasOpenObjection: false,
};

/** The rest is to be submitted at the supplementary policy Y-1. */
const planInvoice: PlanInvoiceDto = {
  invoiceUID: 'i-1',
  invoiceNumber: 'R-1',
  action: 'submit',
  policies: [
    { contractUID: 'x', action: 'answered', reimbursement: 800 },
    { contractUID: 'y', action: 'submit', reimbursement: 200 },
  ],
};

const props = {
  open: true,
  invoice,
  accountName: 'John Doe',
  facilities: [],
  agencies: [],
  agencyPaymentDetails: {},
  contracts: [
    { value: 'x', label: 'X-1 · PKV', contractBegin: '2020-01-01', contractEnd: null },
    { value: 'y', label: 'Y-1 · Zusatz', contractBegin: '2020-01-01', contractEnd: null },
    { value: 'z', label: 'Z-1 · Zusatz', contractBegin: '2020-01-01', contractEnd: null },
  ],
  planInvoice,
  submitting: false,
  error: null,
};

describe('InvoiceDetailDialog assignment block', () => {
  it('shows a card per submission with its billing, and one per mark', () => {
    const wrapper = mount(InvoiceDetailDialog, { props, attachTo: document.body });
    const text = wrapper.text().replace(/\u00a0/g, ' ');
    expect(text).toContain('X-1 · PKV');
    expect(text).toContain('LA-42');
    expect(text).toContain('Beleg BEL-7');
    expect(text).toContain('800,00 €');
    expect(text).toContain('Z-1 · Zusatz');
    expect(text).toContain('Brille');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = mount(InvoiceDetailDialog, { props, attachTo: document.body });
    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});

describe('InvoiceDetailDialog ad-hoc create', () => {
  beforeEach(() => createResource.mockReset());

  /** The row of the mask carrying `label`. */
  const row = (wrapper: ReturnType<typeof mount>, label: string) =>
    wrapper.findAllComponents(EuDetailField).find((c) => c.props('label') === label);

  const addAction = (wrapper: ReturnType<typeof mount>, noun: string) =>
    wrapper.findAll('button').find((b) => b.attributes('aria-label') === `${noun} hinzufügen`);

  it('creates the facility typed into the mask and selects it right away', async () => {
    createResource.mockResolvedValue({ facilityUID: 'f-9', facilityName: 'Praxis Süd' });
    const wrapper = mount(InvoiceDetailDialog, { props, attachTo: document.body });

    await wrapper.find('input[aria-label="Leistungserbringer"]').setValue('Praxis Süd');
    await addAction(wrapper, 'Leistungserbringer')?.trigger('click');

    const form = wrapper.findComponent(ResourceFormDialog);
    expect(form.props('open')).toBe(true);
    expect(form.props('prefill')).toEqual({ facilityName: 'Praxis Süd' });

    form.vm.$emit('submit', { facilityName: 'Praxis Süd' });
    await flushPromises();

    expect(createResource).toHaveBeenCalledWith('/facilities', { facilityName: 'Praxis Süd' });
    const facility = row(wrapper, 'Leistungserbringer');
    expect(facility?.props('modelValue')).toBe('f-9');
    expect(facility?.props('options')).toContainEqual({ value: 'f-9', label: 'Praxis Süd' });
    // The parent's lookup lists are stale now — without this the new name would
    // be missing from the invoice table until the page is reloaded.
    expect(wrapper.emitted('entityCreated')).toHaveLength(1);
    expect(form.props('open')).toBe(false);
    wrapper.unmount();
  });
});
