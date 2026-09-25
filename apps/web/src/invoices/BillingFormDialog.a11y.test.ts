import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingListDto } from './api';
import BillingFormDialog from './BillingFormDialog.vue';

const { createBilling, updateBilling } = vi.hoisted(() => ({
  createBilling: vi.fn(),
  updateBilling: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  createBilling,
  updateBilling,
}));

const billing: BillingListDto = {
  billingUID: 'b-1',
  contractUID: 'c-1',
  billingDate: '2025-04-01',
  billingNumber: 'LA-42',
  documentLink: null,
  forfeitsBonus: true,
  objectionDate: null,
  objectionResolvedDate: null,
  objectionNote: null,
  accountUID: 'a-1',
  personName: 'Clara Beispiel',
  contractNumber: 'X-1',
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  reimbursedTotal: 120,
  invoiceCount: 1,
  invoiceNumbers: 'R-1',
};

async function openDialog(props: Partial<InstanceType<typeof BillingFormDialog>['$props']> = {}) {
  const wrapper = mount(BillingFormDialog, {
    props: { open: true, bonusForfeitRule: 'ON_REIMBURSEMENT', ...props },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

/** Fills a text field by its visible label. */
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

function clickFooter(
  wrapper: Awaited<ReturnType<typeof openDialog>>,
  text: string,
): Promise<void> | undefined {
  return wrapper
    .findAll('button')
    .find((b) => b.text() === text)
    ?.trigger('click');
}

beforeEach(() => {
  vi.clearAllMocks();
  createBilling.mockResolvedValue({ ...billing, billingUID: 'b-new', billingNumber: 'LA-99' });
  updateBilling.mockResolvedValue({ ...billing, billingNumber: 'LA-43' });
});

describe('BillingFormDialog creating a billing', () => {
  it('creates the billing under the policy it was opened for', async () => {
    const wrapper = await openDialog({ contractUID: 'c-1' });
    expect(wrapper.text()).toContain('Neue Leistungsabrechnung');

    await fill(wrapper, 'Abrechnungsnummer', 'LA-99');
    await clickFooter(wrapper, 'Anlegen');
    await flushPromises();

    expect(createBilling).toHaveBeenCalledWith(
      expect.objectContaining({ contractUID: 'c-1', billingNumber: 'LA-99' }),
    );
    expect(wrapper.emitted('saved')?.[0]).toEqual([
      expect.objectContaining({ billingUID: 'b-new' }),
    ]);
    wrapper.unmount();
  });

  // A billing belongs to the policy, which every caller of this dialog knows,
  // so there is nothing left to ask for (Slice 37).
  it('never asks which submission the billing belongs to', async () => {
    const wrapper = await openDialog({ contractUID: 'c-7', presetNumber: 'LA-7' });
    expect(wrapper.findAll('label').map((l) => l.text())).not.toContain('Einreichung');

    await clickFooter(wrapper, 'Anlegen');
    await flushPromises();

    expect(createBilling).toHaveBeenCalledWith(
      expect.objectContaining({ contractUID: 'c-7', billingNumber: 'LA-7' }),
    );
    wrapper.unmount();
  });

  it('asks for the number instead of sending an incomplete billing', async () => {
    const wrapper = await openDialog({ contractUID: 'c-1' });
    await fill(wrapper, 'Abrechnungsnummer', '  ');
    await clickFooter(wrapper, 'Anlegen');
    await flushPromises();

    expect(createBilling).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Abrechnungsnummer');
    expect(wrapper.find('[role="alert"]').text()).toContain('angeben');
    wrapper.unmount();
  });
});

describe('BillingFormDialog editing a billing', () => {
  it('shows the stored values and patches what changed', async () => {
    const wrapper = await openDialog({ billing });

    expect(wrapper.text()).toContain('Abrechnung bearbeiten');
    expect(wrapper.find<HTMLInputElement>('input[type="date"]').element.value).toBe('2025-04-01');

    await fill(wrapper, 'Abrechnungsnummer', 'LA-43');
    await clickFooter(wrapper, 'Speichern');
    await flushPromises();

    expect(updateBilling).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ billingNumber: 'LA-43', forfeitsBonus: true }),
    );
    expect(createBilling).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('BillingFormDialog accessibility', () => {
  it('has no automatically detectable violations when creating', async () => {
    const wrapper = await openDialog({ contractUID: 'c-1' });
    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it('has no automatically detectable violations when editing', async () => {
    const wrapper = await openDialog({ billing });
    const results = await axe.run(wrapper.element, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
