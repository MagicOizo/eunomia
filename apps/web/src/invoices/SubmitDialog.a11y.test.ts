import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { settled } from '../test/settle';
import { withLocale } from '../test/locale';
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
    agencyAccountUID: null,
    directPayment: false,
    reimbursementClosed: false,
    notCovered: false,
    notCoveredReason: null,
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

/**
 * The selector EuDialog focuses by once it is open — mirrored so this file can
 * wait for that focus. Where it matches nothing (a dialog with no policy, and
 * therefore no form) nothing is deferred and there is nothing to wait for.
 */
const DIALOG_FOCUSES = '.eu-dialog__body input, .eu-dialog__body select, .eu-dialog__body textarea';

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
  // Not just one flush. EuDialog opens the native dialog in `onMounted` and
  // then defers a focus() into the body with nextTick — here onto the toggle,
  // the first form control in the body. Landing mid-test, that focus moves the
  // caret off the policy picker and closes the list a case had just opened, so
  // this waits for it to have happened (issues.md 0.19.0-2; ../test/settle.ts).
  await settled(
    () => wrapper.findAll('button').some((b) => b.text() === 'Einreichen'),
    'the dialog footer to render its submit button',
  );
  await settled(
    () =>
      !wrapper.find(DIALOG_FOCUSES).exists() || wrapper.element.contains(document.activeElement),
    "the dialog's own focus to land inside it",
  );
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

/**
 * Opens the policy list the way a person does — a click on the field — and
 * returns once it is open. The list is `v-if="open"` and the click reaches it
 * through a render, so reading the options straight after the click is a race
 * (issues.md 0.19.0-2).
 */
async function openList(wrapper: Dialog): Promise<void> {
  const input = wrapper.find('.eu-picker input');
  await input.trigger('focus');
  await input.trigger('click');
  await settled(() => wrapper.find('[role="listbox"]').exists(), 'the policy list to open');
}

async function toggleShowAll(wrapper: Dialog): Promise<void> {
  await wrapper.find('.eu-toggle input').setValue(true);
}

/**
 * Clicks a footer button by its label — and fails saying so when there is no
 * such button. It used to shrug (`?.trigger`), which turned a missing button
 * into a confusing failure three assertions later: nothing was emitted and no
 * error appeared, because nothing had been clicked (issues.md 0.19.0-2).
 */
async function clickFooter(wrapper: Dialog, text: string): Promise<void> {
  const button = wrapper.findAll('button').find((b) => b.text() === text);
  if (!button) {
    const labels = wrapper.findAll('button').map((b) => b.text());
    throw new Error(`No footer button "${text}" — the buttons are ${JSON.stringify(labels)}`);
  }
  await button.trigger('click');
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

describe('SubmitDialog in English', () => {
  it('counts the selection and the hidden policies by number', async () => {
    await withLocale('en', async () => {
      const wrapper = mount(SubmitDialog, {
        props: {
          open: true,
          invoices: [invoice('i-1', '2023-06-01')],
          facilityNames: {},
          contracts,
          submitting: false,
          error: null,
        },
        attachTo: document.body,
      });
      await flushPromises();

      expect(wrapper.find('.eu-dialog__title').text()).toBe('Submit invoices');
      expect(wrapper.text()).toContain('1 invoice is bundled into one submission.');
      expect(wrapper.text()).toContain('1 policy outside the treatment period is hidden.');
      expect(wrapper.findAll('button').some((b) => b.text() === 'Submit')).toBe(true);
      wrapper.unmount();
    });
  });
});
