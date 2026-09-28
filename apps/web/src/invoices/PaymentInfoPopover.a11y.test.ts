import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { InvoiceDto } from './api';
import PaymentInfoPopover from './PaymentInfoPopover.vue';

const invoice: InvoiceDto = {
  invoiceUID: 'i-1',
  invoiceNumber: 'R-1',
  invoiceDate: '2026-02-01',
  treatmentDate: '2026-01-15',
  treatmentDates: ['2026-01-15'],
  accountUID: 'a-1',
  facilityUID: 'f-1',
  invoiceAmount: 320,
  transferUntilDate: '2026-03-01',
  transferDate: null,
  transferSubject: 'Rechnung 110',
  documentLink: null,
  agencyUID: 'c-1',
  agencyAccountUID: 'g-2',
  directPayment: 0,
  reimbursementClosed: false,
  notCovered: false,
  notCoveredReason: null,
  reimbursedTotal: 0,
  allocationCount: 0,
  remainingAmount: 320,
  workflowStatus: 'offen',
  submissions: [],
  exclusions: [],
  hasOpenObjection: false,
};

/** Two accounts side by side; the invoice above goes to the second. */
const accounts = [
  {
    agencyAccountUID: 'g-1',
    bankAccount: 'DE02120300000000202051',
    bic: null,
    recipientName: null,
    note: null,
  },
  {
    agencyAccountUID: 'g-2',
    bankAccount: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    recipientName: 'Zahlstelle Beispiel Inkasso',
    note: null,
  },
];

const props = {
  invoice,
  facilityName: 'Hausarztpraxis Dr. Beispiel',
  agencyName: 'Beispiel Inkasso GmbH',
  accounts,
};

/** Mounts with a trigger and clicks it, so the bubble's content is rendered. */
async function openPopover(overrides: Partial<typeof props> = {}) {
  const wrapper = mount(PaymentInfoPopover, {
    props: { ...props, ...overrides },
    attachTo: document.body,
    slots: { trigger: '<button type="button">Info</button>' },
  });
  await wrapper.find('button').trigger('click');
  return wrapper;
}

/**
 * The label column is icons only. Every icon must still carry its label —
 * Font Awesome's `title` prop renders neither a tooltip nor an accessible
 * name, which is what EuIconLabel exists for.
 */
describe('PaymentInfoPopover labels', () => {
  it('names every icon in text, not only as an icon', async () => {
    const wrapper = await openPopover();

    const labels = wrapper.findAll('dt').map((dt) => dt.text());
    expect(labels).toEqual([
      'Leistungserbringer',
      'Zahlungsziel',
      'Rechnungssumme',
      'Abrechnungsdienstleister / Empfänger',
      'IBAN',
      'BIC',
      'Verwendungszweck',
      'Barzahlung',
    ]);
    wrapper.unmount();
  });

  it('shows the label as a tooltip on hover', async () => {
    const wrapper = await openPopover();

    await wrapper.findAll('dt')[1].find('.eu-tooltip-trigger').trigger('mouseenter');
    const tooltip = document.body.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Zahlungsziel');
    wrapper.unmount();
  });
});

/**
 * Which account applies is what the invoice names, not a rule about dates (see
 * agencies/accounts.ts).
 */
describe('PaymentInfoPopover account resolution', () => {
  it('names the beneficiary of the chosen account, not the agency', async () => {
    const wrapper = await openPopover();

    const values = wrapper.findAll('dd').map((dd) => dd.text());
    expect(values).toContain('Zahlstelle Beispiel Inkasso');
    expect(values.some((value) => value.includes('DE89370400440532013000'))).toBe(true);
    wrapper.unmount();
  });

  it('falls back to the first account while the invoice names none', async () => {
    const wrapper = await openPopover({
      invoice: { ...invoice, agencyAccountUID: null },
    });

    const values = wrapper.findAll('dd').map((dd) => dd.text());
    expect(values.some((value) => value.includes('DE02120300000000202051'))).toBe(true);
    // That account names no beneficiary, so the agency carries the line.
    expect(values).toContain('Beispiel Inkasso GmbH');
    wrapper.unmount();
  });

  it('leaves out IBAN and BIC for an agency without any account', async () => {
    const wrapper = await openPopover({ accounts: [] });

    const labels = wrapper.findAll('dt').map((dt) => dt.text());
    expect(labels).not.toContain('IBAN');
    expect(labels).not.toContain('BIC');
    wrapper.unmount();
  });
});
