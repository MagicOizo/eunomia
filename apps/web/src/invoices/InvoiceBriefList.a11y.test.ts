import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { InvoiceDto } from './api';
import InvoiceBriefList from './InvoiceBriefList.vue';

function invoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceUID: 'i-1',
    invoiceNumber: 'R-2026-113',
    invoiceDate: '2026-02-01',
    treatmentDate: '2026-01-15',
    accountUID: 'a-1',
    facilityUID: 'f-1',
    invoiceAmount: 500,
    transferUntilDate: null,
    transferDate: null,
    transferSubject: null,
    documentLink: null,
    agencyUID: null,
    directPayment: 0,
    reimbursementClosed: false,
    reimbursedTotal: 0,
    allocationCount: 0,
    remainingAmount: 500,
    workflowStatus: 'offen',
    submissions: [],
    exclusions: [],
    hasOpenObjection: false,
    ...overrides,
  };
}

const props = {
  invoices: [
    invoice(),
    invoice({ invoiceUID: 'i-2', invoiceNumber: 'R-2026-114', facilityUID: null }),
  ],
  facilityNames: { 'f-1': 'Hausarztpraxis Dr. Beispiel' },
};

describe('InvoiceBriefList', () => {
  it('lists number, provider, date and amount per invoice', () => {
    const wrapper = mount(InvoiceBriefList, { props });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);

    const first = rows[0].text().replace(/\u00a0/g, ' ');
    expect(first).toContain('R-2026-113');
    expect(first).toContain('Hausarztpraxis Dr. Beispiel');
    expect(first).toContain('01.02.2026');
    expect(first).toContain('500,00 €');

    // An invoice without a provider keeps the column filled with a dash.
    expect(rows[1].text()).toContain('–');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = mount(InvoiceBriefList, { props, attachTo: document.body });
    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
