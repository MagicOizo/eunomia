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
    agencyAccountUID: null,
    directPayment: false,
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
    const wrapper = open(invoice({ directPayment: true, transferUntilDate: '2025-02-01' }));
    await setDirectPayment(wrapper, false);

    expect(row(wrapper, 'Zahlungsziel')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Zahlungsdatum')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Zahlungsziel')?.props('disabled')).toBe(false);
    wrapper.unmount();
  });

  it('leaves an invoice from before the rule untouched when it is merely opened', async () => {
    // A direct payment entered before Slice 43 carries no dates at all. Opening
    // it must not look like an edit — the mask would offer a change nobody made.
    const wrapper = open(invoice({ directPayment: true, transferUntilDate: null }));
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

/**
 * Slice 49: the GiroCode keeps its place. The wide dialog measures itself
 * against its content, so a button that comes and goes carried the dialog's
 * width with it (issues.md 0.13.0-5).
 */
describe('InvoiceDetailDialog GiroCode', () => {
  const agencyAccounts = {
    'c-1': [
      {
        agencyAccountUID: 'g-1',
        bankAccount: 'DE89370400440532013000',
        bic: null,
        recipientName: null,
        note: null,
      },
    ],
  };

  function openWithAccount(overrides: Partial<InvoiceDto> = {}) {
    return mount(InvoiceDetailDialog, {
      props: {
        open: true,
        invoice: invoice({ agencyUID: 'c-1', agencyAccountUID: 'g-1', ...overrides }),
        accountName: 'John Doe',
        facilities: [],
        agencies: [{ value: 'c-1', label: 'Inkasso Eins' }],
        agencyAccounts,
        contracts: [],
        planInvoice: null,
        submitting: false,
        error: null,
      },
      attachTo: document.body,
    });
  }

  it('offers the code while there is something left to transfer', () => {
    const wrapper = openWithAccount();
    const slot = wrapper.find('.eu-detail__qr');

    expect(slot.exists()).toBe(true);
    expect(slot.classes()).not.toContain('is-hidden');
    wrapper.unmount();
  });

  it("keeps the button's place once the invoice is paid, instead of dropping it", async () => {
    const wrapper = openWithAccount();

    row(wrapper, 'Zahlungsdatum')?.vm.$emit('update:modelValue', '2025-02-20');
    await nextTick();

    const slot = wrapper.find('.eu-detail__qr');
    // Still in the mask — hidden, so the row and the dialog keep their width.
    expect(slot.exists()).toBe(true);
    expect(slot.classes()).toContain('is-hidden');
    wrapper.unmount();
  });
});

/**
 * Slice 44: the invoice names the bank account it goes to. The mask offers the
 * accounts of the agency it points at, and mirrors the API's rule about what a
 * change of agency does to that choice.
 */
describe('InvoiceDetailDialog bank account', () => {
  const agencyAccounts = {
    'c-1': [
      { agencyAccountUID: 'g-1', bankAccount: 'DE01', bic: null, recipientName: null, note: null },
      {
        agencyAccountUID: 'g-2',
        bankAccount: 'DE02',
        bic: 'COBADEFFXXX',
        recipientName: 'Zahlstelle',
        note: null,
      },
    ],
    'c-2': [
      { agencyAccountUID: 'g-9', bankAccount: 'DE09', bic: null, recipientName: null, note: null },
    ],
  };

  function openWithAgencies(inv: InvoiceDto): VueWrapper {
    return mount(InvoiceDetailDialog, {
      props: {
        open: true,
        invoice: inv,
        accountName: 'John Doe',
        facilities: [],
        agencies: [
          { value: 'c-1', label: 'Inkasso Eins' },
          { value: 'c-2', label: 'Inkasso Zwei' },
        ],
        agencyAccounts,
        contracts: [],
        planInvoice: null,
        submitting: false,
        error: null,
      },
      attachTo: document.body,
    });
  }

  it("shows the account the invoice names, out of its agency's own", async () => {
    const wrapper = openWithAgencies(invoice({ agencyUID: 'c-1', agencyAccountUID: 'g-2' }));
    await nextTick();

    const field = row(wrapper, 'Kontoverbindung');
    expect(field?.props('modelValue')).toBe('g-2');
    expect(field?.props('options')).toEqual([
      { value: 'g-1', label: 'DE01', hint: undefined },
      { value: 'g-2', label: 'DE02', hint: 'Zahlstelle' },
    ]);
    wrapper.unmount();
  });

  it('takes the suggestion of the new agency when the invoice moves', async () => {
    const wrapper = openWithAgencies(invoice({ agencyUID: 'c-1', agencyAccountUID: 'g-2' }));
    await nextTick();

    row(wrapper, 'Abrechnungsdienstleister')?.vm.$emit('update:modelValue', 'c-2');
    await nextTick();
    expect(row(wrapper, 'Kontoverbindung')?.props('modelValue')).toBe('g-9');

    // And nothing at all once the agency is gone.
    row(wrapper, 'Abrechnungsdienstleister')?.vm.$emit('update:modelValue', null);
    await nextTick();
    expect(row(wrapper, 'Kontoverbindung')?.props('modelValue')).toBeNull();
    expect(row(wrapper, 'Kontoverbindung')?.props('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('leaves the choice alone while the invoice is merely opened', async () => {
    const wrapper = openWithAgencies(invoice({ agencyUID: 'c-1', agencyAccountUID: 'g-2' }));
    await nextTick();
    await nextTick();

    expect(row(wrapper, 'Kontoverbindung')?.props('modelValue')).toBe('g-2');
    wrapper.unmount();
  });

  it('drops the account with the agency when the bill was paid directly', async () => {
    const wrapper = openWithAgencies(invoice({ agencyUID: 'c-1', agencyAccountUID: 'g-2' }));
    await nextTick();
    await setDirectPayment(wrapper, true);

    expect(row(wrapper, 'Kontoverbindung')?.props('modelValue')).toBeNull();
    wrapper.unmount();
  });
});
