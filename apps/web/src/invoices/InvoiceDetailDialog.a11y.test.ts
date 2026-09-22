import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { InvoiceDto, InvoiceSubmissionDto, PlanInvoiceDto } from './api';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';

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
  accountUID: 'a-1',
  facilityUID: null,
  invoiceAmount: 1000,
  transferUntilDate: null,
  transferDate: null,
  transferSubject: null,
  documentLink: null,
  agencyUID: null,
  directPayment: 0,
  reimbursementClosed: false,
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
  agencyIban: {},
  contracts: [
    { value: 'x', label: 'X-1 · PKV' },
    { value: 'y', label: 'Y-1 · Zusatz' },
    { value: 'z', label: 'Z-1 · Zusatz' },
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
