import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { InvoiceDto } from './api';
import SubmitDialog from './SubmitDialog.vue';

/** An invoice reduced to what the dialog reads: the treatment days and the list row. */
function invoice(invoiceUID: string, treatmentDate: string, ...more: string[]): InvoiceDto {
  return {
    invoiceUID,
    invoiceNumber: `R-${invoiceUID}`,
    invoiceDate: treatmentDate,
    treatmentDate,
    treatmentDates: [treatmentDate, ...more],
    accountUID: 'a-1',
    facilityUID: null,
    invoiceAmount: 100,
    transferUntilDate: null,
    transferDate: null,
    transferSubject: null,
    documentLink: null,
    agencyUID: null,
    directPayment: 0,
    reimbursementClosed: false,
    reimbursedTotal: 0,
    allocationCount: 0,
    remainingAmount: 100,
    workflowStatus: 'offen',
    submissions: [],
    exclusions: [],
    hasOpenObjection: false,
  };
}

/** A policy that ended in 2023 and the one that took over in 2024. */
const contracts = [
  {
    value: 'c-old',
    label: 'X-1 · Alpha AG',
    contractBegin: '2018-01-01',
    contractEnd: '2023-12-31',
  },
  { value: 'c-new', label: 'X-2 · Beta AG', contractBegin: '2024-01-01', contractEnd: null },
];

async function openDialog(props: Partial<InstanceType<typeof SubmitDialog>['$props']> = {}) {
  const wrapper = mount(SubmitDialog, {
    props: {
      open: true,
      invoices: [invoice('i-1', '2023-06-01')],
      facilityNames: {},
      contracts,
      submitting: false,
      error: null,
      ...props,
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Dialog = Awaited<ReturnType<typeof openDialog>>;

/** The policies the picker currently offers, label plus its term line. */
function options(wrapper: Dialog): string[] {
  return wrapper
    .findAll('[role="option"]')
    .map((o) =>
      [o.find('.eu-picker__opt-label').text(), o.find('.eu-picker__opt-hint').text()]
        .filter(Boolean)
        .join(' '),
    );
}

/** Whether the footer's submit button is offered at all. */
const canSubmit = (wrapper: Dialog): boolean =>
  wrapper
    .findAll('button')
    .find((b) => b.text() === 'Einreichen')
    ?.attributes('disabled') === undefined;

/** Opens the policy list the way a person does — a click on the field. */
async function openList(wrapper: Dialog): Promise<void> {
  const input = wrapper.find('.eu-picker input');
  await input.trigger('focus');
  await input.trigger('click');
}

async function toggleShowAll(wrapper: Dialog): Promise<void> {
  await wrapper.find('.eu-toggle input').setValue(true);
}

function clickFooter(wrapper: Dialog, text: string): Promise<void> | undefined {
  return wrapper
    .findAll('button')
    .find((b) => b.text() === text)
    ?.trigger('click');
}

describe('SubmitDialog policy choice', () => {
  it('offers only the policy that ran when the treatment happened', async () => {
    const wrapper = await openDialog();
    await openList(wrapper);

    expect(options(wrapper)).toEqual(['X-1 · Alpha AG 01.01.2018 – 31.12.2023']);
    expect(wrapper.text()).toContain('Police außerhalb des Behandlungszeitraums ist ausgeblendet');
    wrapper.unmount();
  });

  it('takes the only policy that is left, so the choice is already made', async () => {
    const wrapper = await openDialog();
    await clickFooter(wrapper, 'Einreichen');

    expect(wrapper.emitted('submit')?.[0]).toEqual([
      expect.objectContaining({ contractUID: 'c-old' }),
    ]);
    wrapper.unmount();
  });

  it('shows the ones outside the period once the switch is thrown', async () => {
    const wrapper = await openDialog();
    await toggleShowAll(wrapper);
    await openList(wrapper);

    expect(options(wrapper)).toEqual([
      'X-1 · Alpha AG 01.01.2018 – 31.12.2023',
      'X-2 · Beta AG ab 01.01.2024',
    ]);
    wrapper.unmount();
  });

  it('drops a choice the switch takes back out of the list', async () => {
    // Two policies in the period, so nothing is preselected and the pick stands out.
    const wrapper = await openDialog({
      contracts: [
        ...contracts,
        { value: 'c-add', label: 'X-3 · Gamma AG', contractBegin: '2018-01-01', contractEnd: null },
      ],
    });
    await toggleShowAll(wrapper);
    await openList(wrapper);
    const outside = wrapper.findAll('[role="option"]').at(-1);
    await outside?.trigger('mousedown');
    await wrapper.find('.eu-toggle input').setValue(false);

    await clickFooter(wrapper, 'Einreichen');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('Bitte Police');
    wrapper.unmount();
  });

  it('names the span of a bulk selection when no policy covers all of it', async () => {
    const wrapper = await openDialog({
      invoices: [invoice('i-1', '2023-11-01'), invoice('i-2', '2024-02-01')],
    });

    expect(options(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain('Keine Police lief im Behandlungszeitraum');
    expect(wrapper.text()).toContain('01.11.2023 – 01.02.2024');
    expect(canSubmit(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('keeps its old message when the invoice has nowhere left to go', async () => {
    const wrapper = await openDialog({ contracts: [] });

    expect(wrapper.text()).toContain('Keine Police verfügbar');
    expect(wrapper.findAll('.eu-toggle')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('SubmitDialog accessibility', () => {
  it('has no automatically detectable violations, filtered or not', async () => {
    const wrapper = await openDialog();
    const rules = {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      'color-contrast': { enabled: false },
    };
    expect((await axe.run(wrapper.element, { rules })).violations).toEqual([]);

    await toggleShowAll(wrapper);
    expect((await axe.run(wrapper.element, { rules })).violations).toEqual([]);
    wrapper.unmount();
  });
});
