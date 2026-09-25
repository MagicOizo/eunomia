import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingListDto } from './api';
import BillingSearchDialog from './BillingSearchDialog.vue';

const { searchBillings } = vi.hoisted(() => ({ searchBillings: vi.fn() }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
}));

function billing(overrides: Partial<BillingListDto> = {}): BillingListDto {
  return {
    billingUID: 'b-1',
    contractUID: 'c-1',
    billingDate: '2025-04-01',
    billingNumber: 'LA-42',
    documentLink: null,
    forfeitsBonus: null,
    objectionDate: null,
    objectionResolvedDate: null,
    objectionNote: null,
    accountUID: 'a-1',
    personName: 'Clara Beispiel',
    contractNumber: 'X-1',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    reimbursedTotal: 250,
    invoiceCount: 1,
    invoiceNumbers: 'R-1',
    ...overrides,
  };
}

const props = {
  open: true,
  contractUID: 'c-1',
  policyLabel: 'X-1 · PKV',
  initialQuery: 'LA',
};

async function openDialog() {
  const wrapper = mount(BillingSearchDialog, { props, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  searchBillings.mockReset();
  searchBillings.mockResolvedValue([billing()]);
});

describe('BillingSearchDialog', () => {
  it('searches the submission with the query it was opened with', async () => {
    const wrapper = await openDialog();

    expect(searchBillings).toHaveBeenCalledWith(
      expect.objectContaining({ contractUID: 'c-1', q: 'LA', limit: 50 }),
    );
    const text = wrapper.text().replace(/\u00a0/g, ' ');
    expect(text).toContain('X-1 · PKV');
    expect(text).toContain('LA-42');
    expect(text).toContain('250,00 €');
    expect(text).toContain('R-1');
    wrapper.unmount();
  });

  it('hands over the billing that was picked', async () => {
    const wrapper = await openDialog();
    await wrapper.find('.eu-bsearch__hit').trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Auswählen')
      ?.trigger('click');

    expect(wrapper.emitted('select')?.[0][0]).toMatchObject({ billingUID: 'b-1' });
    wrapper.unmount();
  });

  it('says so when nothing matches', async () => {
    searchBillings.mockResolvedValue([]);
    const wrapper = await openDialog();
    expect(wrapper.text()).toContain('Keine Leistungsabrechnung passt');
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
