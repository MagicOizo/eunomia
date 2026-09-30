import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import AllocationDialog from './AllocationDialog.vue';
import type { InvoiceAllocationDto, InvoiceDto } from './api';

const allocation: InvoiceAllocationDto = {
  allocationUID: 'al-1',
  billingUID: 'b-1',
  billingNumber: 'LA-42',
  billingDate: '2025-04-01',
  receiptNumber: 'BN-7',
  reimbursement: 150,
  objectionOpen: false,
};

const invoice: InvoiceDto = {
  invoiceUID: 'i-1',
  invoiceNumber: 'R-1',
  invoiceDate: '2025-02-01',
  treatmentDate: '2025-01-15',
  treatmentDates: ['2025-01-15'],
  accountUID: 'a-1',
  facilityUID: 'f-1',
  invoiceAmount: 400,
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
  reimbursedTotal: 150,
  allocationCount: 1,
  remainingAmount: 250,
  workflowStatus: 'teilabgerechnet',
  submissions: [],
  exclusions: [],
  hasOpenObjection: false,
};

async function openDialog() {
  const wrapper = mount(AllocationDialog, {
    props: { open: true, allocation, invoice, submitting: false, error: null },
  });
  await flushPromises();
  return wrapper;
}

/**
 * Correcting a booked reimbursement starts from the booked amount; the invoice
 * amount named in the note above it is one click away (issues.md 0.13.0-4).
 */
describe('AllocationDialog amount shortcut', () => {
  it('starts on the booked amount and takes the invoice amount on request', async () => {
    const wrapper = await openDialog();
    const field = () => wrapper.findComponent(EuCurrencyField).props('modelValue');

    expect(field()).toBe(150);

    await wrapper.find('.eu-alloc__take').trigger('click');

    expect(field()).toBe(400);
    wrapper.unmount();
  });

  it('names what the click would do', async () => {
    const wrapper = await openDialog();
    const take = wrapper.find('.eu-alloc__take');

    expect(take.text().replace(/\u00a0/g, ' ')).toBe('400,00 €');
    expect(take.attributes('aria-label')).toContain('in Erstattung übernehmen');
    wrapper.unmount();
  });
});
