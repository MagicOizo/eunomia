import { type VueWrapper, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import EuDetailField from '../design-system/components/EuDetailField.vue';
import type { InvoiceDto } from './api';
import InvoiceDetailDialog from './InvoiceDetailDialog.vue';

/** A plain, unsubmitted invoice; the tests below only touch the payment block. */
function invoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceUID: 'i-1',
    invoiceNumber: 'R-1',
    invoiceDate: '2025-02-01',
    treatmentDate: '2025-01-15',
    treatmentDates: ['2025-01-15'],
    accountUID: 'a-1',
    facilityUID: null,
    invoiceAmount: 120,
    transferUntilDate: '2025-03-01',
    transferDate: null,
    transferSubject: 'R-1',
    documentLink: null,
    agencyUID: null,
    directPayment: 0,
    reimbursementClosed: false,
    notCovered: false,
    notCoveredReason: null,
    reimbursedTotal: 0,
    allocationCount: 0,
    remainingAmount: 120,
    workflowStatus: 'offen',
    submissions: [],
    exclusions: [],
    hasOpenObjection: false,
    ...overrides,
  };
}

function open(inv: InvoiceDto): VueWrapper {
  return mount(InvoiceDetailDialog, {
    props: {
      open: true,
      invoice: inv,
      accountName: 'John Doe',
      facilities: [],
      agencies: [],
      agencyAccounts: {},
      contracts: [],
      planInvoice: null,
      submitting: false,
      error: null,
    },
    attachTo: document.body,
  });
}

/** The row of the mask carrying `label`. */
const row = (wrapper: VueWrapper, label: string) =>
  wrapper.findAllComponents(EuDetailField).find((c) => c.props('label') === label);

async function setDirectPayment(wrapper: VueWrapper, on: boolean): Promise<void> {
  row(wrapper, 'Direkt-/Barzahlung')?.vm.$emit('update:modelValue', on);
  await nextTick();
}

// Slice 43: the bill was settled on the spot, so it is due and paid on its own
// date. The API keeps the rule for every write; the mask shows it while open.
describe('InvoiceDetailDialog direct payment', () => {
  it('dates the invoice as due and paid on its own date, and locks the fields', async () => {
    const wrapper = open(invoice());
    await setDirectPayment(wrapper, true);

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBe('2025-02-01');
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBe('2025-02-01');
    expect(row(wrapper, 'Zahlungsziel')?.props('disabled')).toBe(true);
    expect(row(wrapper, 'Zahlungsdatum')?.props('disabled')).toBe(true);
    // The fields that only make sense for a transfer go with them.
    expect(row(wrapper, 'Verwendungszweck')?.props('modelValue')).toBe('');
    wrapper.unmount();
  });

  it('follows a corrected invoice date while it is switched on', async () => {
    const wrapper = open(invoice());
    await setDirectPayment(wrapper, true);

    row(wrapper, 'Rechnungsdatum')?.vm.$emit('update:modelValue', '2025-02-04');
    await nextTick();

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBe('2025-02-04');
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBe('2025-02-04');
    wrapper.unmount();
  });

  it('frees both dates again, empty, when it is switched off', async () => {
    const wrapper = open(invoice({ directPayment: 1, transferUntilDate: '2025-02-01' }));
    await setDirectPayment(wrapper, false);

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Zahlungsziel')?.props('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('leaves an invoice from before the rule untouched when it is merely opened', async () => {
    // A direct payment entered before Slice 43 carries no dates at all. Opening
    // it must not look like an edit — the mask would offer a change nobody made.
    const wrapper = open(invoice({ directPayment: 1, transferUntilDate: null }));
    await nextTick();

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBeNull();
    wrapper.unmount();
  });

  it('leaves the dates of an ordinary invoice alone when its date is corrected', async () => {
    const wrapper = open(invoice({ transferDate: '2025-02-20' }));

    row(wrapper, 'Rechnungsdatum')?.vm.$emit('update:modelValue', '2025-02-03');
    await nextTick();

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBe('2025-03-01');
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBe('2025-02-20');
    wrapper.unmount();
  });
});
