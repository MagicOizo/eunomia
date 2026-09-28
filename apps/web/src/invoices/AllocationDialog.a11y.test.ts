import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { InvoiceAllocationDto, InvoiceDto, InvoiceSubmissionDto } from './api';
import AllocationDialog from './AllocationDialog.vue';

const allocation: InvoiceAllocationDto = {
  allocationUID: 'l-1',
  billingUID: 'b-1',
  billingNumber: 'LA-42',
  billingDate: '2025-04-01',
  receiptNumber: 'BEL-1',
  reimbursement: 100,
  objectionOpen: false,
};

const submission: InvoiceSubmissionDto = {
  submissionUID: 'e-1',
  contractUID: 'c-1',
  contractNumber: 'X-1',
  companyName: 'PKV',
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  submittedDate: '2025-03-04',
  billingCount: 1,
  reimbursed: 100,
  status: 'abgerechnet',
  allocations: [allocation],
};

/** 400 € invoice, 100 € of it booked through this very allocation. */
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
  directPayment: 0,
  reimbursementClosed: false,
  notCovered: false,
  notCoveredReason: null,
  reimbursedTotal: 100,
  allocationCount: 1,
  remainingAmount: 300,
  workflowStatus: 'teilabgerechnet',
  submissions: [submission],
  exclusions: [],
  hasOpenObjection: false,
};

async function openDialog(props: Partial<InstanceType<typeof AllocationDialog>['$props']> = {}) {
  const wrapper = mount(AllocationDialog, {
    props: { open: true, allocation, invoice, submitting: false, error: null, ...props },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

/** Sets a field by its visible label. */
async function fill(
  wrapper: Awaited<ReturnType<typeof openDialog>>,
  label: string,
  value: string,
): Promise<void> {
  const id = wrapper
    .findAll('label')
    .find((l) => l.text() === label)
    ?.attributes('for');
  const input = wrapper.findAll('input').find((i) => i.attributes('id') === id);
  await input?.setValue(value);
}

function save(wrapper: Awaited<ReturnType<typeof openDialog>>): Promise<void> | undefined {
  return wrapper
    .findAll('button')
    .find((b) => b.text() === 'Speichern')
    ?.trigger('click');
}

describe('AllocationDialog', () => {
  it('opens with what is booked today and hands back what was changed', async () => {
    const wrapper = await openDialog();
    const text = wrapper.text().replace(/\u00a0/g, ' ');
    expect(text).toContain('R-1');
    expect(text).toContain('LA-42');
    expect(text).toContain('01.04.2025');

    // The dialog focuses the amount, and a focused currency field shows the
    // plain editable value; formatted once it is left.
    const amount = wrapper.findAll('input')[0];
    expect((amount.element as HTMLInputElement).value).toBe('100');
    await amount.trigger('blur');
    expect((amount.element as HTMLInputElement).value).toBe('100,00');
    expect(wrapper.findAll('input').map((i) => (i.element as HTMLInputElement).value)).toContain(
      'BEL-1',
    );

    await fill(wrapper, 'Erstattung', '250');
    await fill(wrapper, 'Belegnummer', 'BEL-2');
    await save(wrapper);

    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { allocationUID: 'l-1', reimbursement: 250, receiptNumber: 'BEL-2' },
    ]);
    wrapper.unmount();
  });

  it('counts the booking itself as free: the whole invoice amount is allowed', async () => {
    const wrapper = await openDialog();
    await fill(wrapper, 'Erstattung', '400');
    await save(wrapper);

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ reimbursement: 400 });
    wrapper.unmount();
  });

  it('refuses more than the invoice carries instead of sending it', async () => {
    const wrapper = await openDialog();
    await fill(wrapper, 'Erstattung', '400,01');
    await save(wrapper);

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('400,00');
    wrapper.unmount();
  });

  it('clears the receipt number rather than sending an empty one', async () => {
    const wrapper = await openDialog();
    await fill(wrapper, 'Belegnummer', '  ');
    await save(wrapper);

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ receiptNumber: null });
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
