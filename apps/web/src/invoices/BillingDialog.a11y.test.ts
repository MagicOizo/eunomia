import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingListDto, InvoiceDto, InvoiceSubmissionDto } from './api';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import { withLocale } from '../test/locale';
import BillingDialog from './BillingDialog.vue';

const { searchBillings, listAccountInvoices } = vi.hoisted(() => ({
  searchBillings: vi.fn(),
  listAccountInvoices: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  searchBillings,
  listAccountInvoices,
}));

function submission(overrides: Partial<InvoiceSubmissionDto> = {}): InvoiceSubmissionDto {
  return {
    submissionUID: 'e-1',
    contractUID: 'c-1',
    contractNumber: 'X-1',
    companyName: 'PKV',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    submittedDate: '2025-03-04',
    billingCount: 0,
    reimbursed: 0,
    status: 'eingereicht',
    allocations: [],
    ...overrides,
  };
}

function invoice(number: string, overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    invoiceUID: `i-${number}`,
    invoiceNumber: number,
    invoiceDate: '2025-02-01',
    treatmentDate: '2025-01-15',
    treatmentDates: ['2025-01-15'],
    accountUID: 'a-1',
    facilityUID: 'f-1',
    invoiceAmount: 400,
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
    remainingAmount: 400,
    workflowStatus: 'eingereicht',
    submissions: [submission()],
    exclusions: [],
    hasOpenObjection: false,
    ...overrides,
  };
}

const billing: BillingListDto = {
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
  reimbursedTotal: 0,
  invoiceCount: 0,
  invoiceNumbers: null,
};

/** Two invoices of the same submission — the bulk case. */
const invoices = [invoice('R-1'), invoice('R-2')];

/** The policy as BillingsView hands it over, where no invoice implies it. */
const policy = {
  contractUID: 'c-1',
  contractNumber: 'X-1',
  companyName: 'PKV',
  bonusForfeitRule: 'ON_REIMBURSEMENT' as const,
  accountUID: 'a-1',
};

async function openDialog(props: Partial<InstanceType<typeof BillingDialog>['$props']> = {}) {
  const wrapper = mount(BillingDialog, {
    props: {
      open: true,
      invoices,
      facilityNames: { 'f-1': 'Hausarztpraxis Dr. Beispiel' },
      submitting: false,
      error: null,
      ...props,
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  searchBillings.mockResolvedValue([billing]);
  listAccountInvoices.mockResolvedValue(invoices);
});

/**
 * The amounts in a card's head are a shortcut into its reimbursement field
 * (issues.md 0.13.0-4): the value stands right above the field it almost always
 * belongs in, and was still typed by hand.
 */
describe('BillingDialog amount shortcut', () => {
  /** The reimbursement field of the nth card, as the currency component sees it. */
  function amountOf(wrapper: Awaited<ReturnType<typeof openDialog>>, index: number) {
    return wrapper.findAllComponents(EuCurrencyField)[index].props('modelValue');
  }

  /** The nth take action of the card at `card` — 0 the invoice amount, 1 the open one. */
  function take(wrapper: Awaited<ReturnType<typeof openDialog>>, card: number, which: number) {
    return wrapper.findAll('.eu-bill__card')[card].findAll('.eu-bill__take')[which];
  }

  it('takes the invoice amount into the card it belongs to', async () => {
    const wrapper = await openDialog();

    await take(wrapper, 0, 0).trigger('click');

    expect(amountOf(wrapper, 0)).toBe(400);
    // The other card is untouched: each shortcut fills its own field.
    expect(amountOf(wrapper, 1)).toBeNull();
    wrapper.unmount();
  });

  it('takes the open amount where an earlier billing already paid part', async () => {
    const wrapper = await openDialog({
      invoices: [invoice('R-1', { reimbursedTotal: 150, remainingAmount: 250 })],
    });

    await take(wrapper, 0, 1).trigger('click');

    expect(amountOf(wrapper, 0)).toBe(250);
    wrapper.unmount();
  });

  it('says what each amount would do, for a screen reader as well', async () => {
    const wrapper = await openDialog();
    const labels = take(wrapper, 0, 0).attributes('aria-label');

    expect(labels).toContain('in Erstattung übernehmen');
    expect(take(wrapper, 0, 1).attributes('aria-label')).toContain('Offenen Betrag');
    wrapper.unmount();
  });
});

/**
 * "Als abgerechnet markieren" per card (issues.md 0.15.0-4): one letter can be
 * the last word on one invoice and only part of the answer for another.
 */
describe('BillingDialog closing mark', () => {
  type Wrapper = Awaited<ReturnType<typeof openDialog>>;

  async function enterAmount(wrapper: Wrapper, card: number, amount: number) {
    wrapper.findAllComponents(EuCurrencyField)[card].vm.$emit('update:modelValue', amount);
    await flushPromises();
  }

  function closeSwitch(wrapper: Wrapper, card: number) {
    return wrapper.findAll('.eu-bill__card')[card].get<HTMLInputElement>('.eu-bill__close input');
  }

  async function save(wrapper: Wrapper) {
    const button = wrapper.findAll('button').find((b) => b.text() === 'Speichern');
    if (!button) throw new Error('no Speichern button');
    await button.trigger('click');
    const submitted = wrapper.emitted('submit');
    if (!submitted) throw new Error(`nothing submitted: ${wrapper.text()}`);
    return (submitted[0][0] as { entries: Array<Record<string, unknown>> }).entries;
  }

  it('is off by default and sends nothing', async () => {
    const wrapper = await openDialog();
    await enterAmount(wrapper, 0, 100);
    await enterAmount(wrapper, 1, 100);

    expect(closeSwitch(wrapper, 0).element.checked).toBe(false);
    expect(closeSwitch(wrapper, 0).element.disabled).toBe(false);
    const entries = await save(wrapper);
    expect(entries.map((e) => e.reimbursementClosed)).toEqual([undefined, undefined]);
    wrapper.unmount();
  });

  it('closes only the invoice whose card says so', async () => {
    const wrapper = await openDialog();
    await enterAmount(wrapper, 0, 100);
    await enterAmount(wrapper, 1, 100);
    await closeSwitch(wrapper, 0).setValue(true);

    const entries = await save(wrapper);
    expect(entries.map((e) => [e.invoiceUID, e.reimbursementClosed])).toEqual([
      ['i-R-1', true],
      ['i-R-2', undefined],
    ]);
    wrapper.unmount();
  });

  it('stands on and locked where the amount pays off what is open, and is not sent', async () => {
    const wrapper = await openDialog();
    // Switched on first, then the amount grows to the open 400: the amount
    // decides now, and a stored mark would outlive a later correction of it.
    await closeSwitch(wrapper, 0).setValue(true);
    await enterAmount(wrapper, 0, 400);
    await enterAmount(wrapper, 1, 100);

    expect(closeSwitch(wrapper, 0).element.checked).toBe(true);
    expect(closeSwitch(wrapper, 0).element.disabled).toBe(true);
    expect(wrapper.findAll('.eu-bill__card')[0].text()).toContain('voll erstattet');
    expect(wrapper.findAll('.eu-bill__card')[1].text()).not.toContain('voll erstattet');

    const entries = await save(wrapper);
    expect(entries.map((e) => e.reimbursementClosed)).toEqual([undefined, undefined]);
    wrapper.unmount();
  });

  it('has no accessibility violations with a switch locked', async () => {
    const wrapper = await openDialog();
    await enterAmount(wrapper, 0, 400);
    const results = await axe.run(wrapper.element, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});

describe('BillingDialog with several invoices', () => {
  it('shows a card per invoice with its own amount field', async () => {
    const wrapper = await openDialog();
    const text = wrapper.text().replace(/\u00a0/g, ' ');

    expect(text).toContain('2 Rechnungen werden');
    expect(text).toContain('R-1');
    expect(text).toContain('R-2');
    expect(wrapper.findAll('.eu-bill__card')).toHaveLength(2);
    expect(text).toContain('Hausarztpraxis Dr. Beispiel');
    // The single existing billing is preselected, with its date shown read-only.
    expect(text).toContain('01.04.2025');
    wrapper.unmount();
  });

  it('asks for the missing amounts instead of sending an incomplete booking', async () => {
    const wrapper = await openDialog();
    const save = wrapper.findAll('button').find((b) => b.text() === 'Speichern');
    await save?.trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('R-1, R-2');
    wrapper.unmount();
  });

  it('refuses a booking without a shared policy', async () => {
    const wrapper = await openDialog({
      invoices: [
        invoice('R-1'),
        invoice('R-3', {
          submissions: [submission({ submissionUID: 'e-2', contractUID: 'c-2' })],
        }),
      ],
    });
    expect(wrapper.text()).toContain('keine gemeinsame Police');
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Speichern')
        ?.attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });

  it('books invoices handed in on different days at the same policy', async () => {
    // What Slice 37 opened up: one letter answers both submissions, so the
    // dialog takes them in one go and each card says which day it came in.
    const wrapper = await openDialog({
      invoices: [
        invoice('R-1'),
        invoice('R-9', {
          submissions: [submission({ submissionUID: 'e-2', submittedDate: '2025-06-19' })],
        }),
      ],
    });
    const text = wrapper.text().replace(/\u00a0/g, ' ');

    expect(text).not.toContain('keine gemeinsame Police');
    expect(wrapper.findAll('.eu-bill__card')).toHaveLength(2);
    expect(text).toContain('eingereicht am 04.03.2025');
    expect(text).toContain('eingereicht am 19.06.2025');
    wrapper.unmount();
  });

  it('starts without a card when it is opened for a policy', async () => {
    const wrapper = await openDialog({ invoices: [], policy });
    const text = wrapper.text().replace(/\u00a0/g, ' ');

    expect(wrapper.findAll('.eu-bill__card')).toHaveLength(0);
    expect(text).toContain('Noch keine Rechnung gewählt');
    // The policy's invoices are offered instead of being filled in beforehand.
    expect(wrapper.findAll('label').map((l) => l.text())).toContain('Rechnung dieser Police');

    const save = wrapper.findAll('button').find((b) => b.text() === 'Speichern');
    await save?.trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Bitte mindestens eine Rechnung wählen.');
    wrapper.unmount();
  });

  it('has no accessibility violations without a card either', async () => {
    const wrapper = await openDialog({ invoices: [], policy });
    const results = await axe.run(wrapper.element, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it('preselects the billing it was handed, even with several candidates', async () => {
    const second: BillingListDto = { ...billing, billingUID: 'b-2', billingNumber: 'LA-43' };
    searchBillings.mockResolvedValue([billing, second]);
    const wrapper = await openDialog({ presetBilling: 'b-2' });

    const picker = wrapper.find<HTMLInputElement>('input[role="combobox"]');
    // The dialog focuses its first field, and a focused picker shows the typed
    // query rather than the selected label.
    await picker.trigger('blur');
    expect(picker.element.value).toBe('LA-43');
    wrapper.unmount();
  });

  it('names the two fields by the card, not by a label carrying the number', async () => {
    const wrapper = await openDialog();
    const labels = wrapper.findAll('label').map((l) => l.text());
    expect(labels).toContain('Erstattung');
    expect(labels).toContain('Belegnummer');
    // A long invoice number in the label wrapped and pushed the two fields out
    // of line with each other; the card's header names them now.
    expect(labels.filter((l) => l.includes('R-1'))).toEqual([]);

    const group = wrapper.findAll('[role="group"]')[0];
    const namedBy = group.attributes('aria-labelledby') ?? '';
    expect(wrapper.get(`[id="${namedBy}"]`).text()).toBe('R-1');
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

describe('BillingDialog in English', () => {
  it('counts the cards and names the amount shortcuts', async () => {
    await withLocale('en', async () => {
      const wrapper = await openDialog();

      expect(wrapper.find('.eu-dialog__title').text()).toBe('Allocate billing');
      expect(wrapper.text()).toContain('2 invoices are reimbursed through this service billing.');
      const takes = wrapper.findAll('.eu-bill__card')[0].findAll('.eu-bill__take');
      expect(takes[1].attributes('aria-label')).toContain('Use the open amount');
      expect(wrapper.text()).toContain('This billing forfeits the bonus');
      wrapper.unmount();
    });
  });
});
