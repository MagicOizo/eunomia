import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { InvoiceDto } from './api';
import PaymentInfoPopover from './PaymentInfoPopover.vue';

const invoice: InvoiceDto = {
  invoiceUID: 'i-1',
  invoiceNumber: 'R-1',
  invoiceDate: '2026-02-01',
  treatmentDate: '2026-01-15',
  accountUID: 'a-1',
  facilityUID: 'f-1',
  invoiceAmount: 320,
  transferUntilDate: '2026-03-01',
  transferDate: null,
  transferSubject: 'Rechnung 110',
  documentLink: null,
  agencyUID: 'c-1',
  directPayment: 0,
  reimbursementClosed: false,
  reimbursedTotal: 0,
  allocationCount: 0,
  remainingAmount: 320,
  workflowStatus: 'offen',
  submissions: [],
  exclusions: [],
  hasOpenObjection: false,
};

const props = {
  invoice,
  facilityName: 'Hausarztpraxis Dr. Beispiel',
  agencyName: 'Beispiel Inkasso GmbH',
  bankAccount: 'DE02120300000000202051',
};

/** Mounts with a trigger and clicks it, so the bubble's content is rendered. */
async function openPopover() {
  const wrapper = mount(PaymentInfoPopover, {
    props,
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
