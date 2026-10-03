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
  directPayment: false,
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

/** Two sets side by side; the invoice above goes to the second. */
const paymentDetails = [
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
  paymentDetails,
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
 * The document link is the one value of an invoice that becomes an `href`, and
 * Vue does not clean one. The schemas refuse anything but http(s) and migration
 * 017 cleared what was stored before they did — this is the second line, for a
 * row that reaches the browser anyway (SEC-01).
 */
describe('PaymentInfoPopover document link', () => {
  it('links a document with an http(s) address', async () => {
    const wrapper = await openPopover({
      invoice: { ...invoice, documentLink: 'https://docs.example/r-1.pdf' },
    });

    const link = wrapper.find('a[href="https://docs.example/r-1.pdf"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Dokument öffnen');
    wrapper.unmount();
  });

  it('puts a link a browser would execute into no href at all', async () => {
    for (const documentLink of [
      'javascript:alert(document.domain)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      const wrapper = await openPopover({ invoice: { ...invoice, documentLink } });

      expect(wrapper.findAll('dt').map((dt) => dt.text())).not.toContain('Dokument');
      expect(wrapper.html()).not.toContain(documentLink);
      wrapper.unmount();
    }
  });
});

/**
 * Which payment details apply is what the invoice names, not a rule about dates
 * (see agencies/payment-details.ts).
 */
describe('PaymentInfoPopover payment-detail resolution', () => {
  it('names the beneficiary of the chosen details, not the agency', async () => {
    const wrapper = await openPopover();

    const values = wrapper.findAll('dd').map((dd) => dd.text());
    expect(values).toContain('Zahlstelle Beispiel Inkasso');
    expect(values.some((value) => value.includes('DE89 3704 0044 0532 0130 00'))).toBe(true);
    wrapper.unmount();
  });

  it('falls back to the first set while the invoice names none', async () => {
    const wrapper = await openPopover({
      invoice: { ...invoice, agencyAccountUID: null },
    });

    const values = wrapper.findAll('dd').map((dd) => dd.text());
    expect(values.some((value) => value.includes('DE02 1203 0000 0000 2020 51'))).toBe(true);
    // That set names no beneficiary, so the agency carries the line.
    expect(values).toContain('Beispiel Inkasso GmbH');
    wrapper.unmount();
  });

  it('leaves out IBAN and BIC for an agency without any payment details', async () => {
    const wrapper = await openPopover({ paymentDetails: [] });

    const labels = wrapper.findAll('dt').map((dt) => dt.text());
    expect(labels).not.toContain('IBAN');
    expect(labels).not.toContain('BIC');
    wrapper.unmount();
  });
});
