import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import TermsFormDialog from './TermsFormDialog.vue';
import type { TermsDto, TermsInput } from './api';

/**
 * Recording a new year's terms (CR-34). The rule is written out in the
 * component and was checked nowhere: a new entry starts as a copy of the
 * previous year's terms — deductible, cap, rate AND the whole bonus scale,
 * because new bonus amounts are what a new entry usually exists for — and it
 * says which year it copied, so nobody saves last year's numbers believing
 * they are this year's.
 */

const previousYear: TermsDto = {
  termsUID: 'k-2025',
  validFromYear: 2025,
  validToYear: null,
  deductible: 600,
  reimbursementCap: 2000,
  reimbursementRate: 80,
  bonusTiers: [
    { claimFreeYears: 2, bonusAmount: 300 },
    { claimFreeYears: 1, bonusAmount: 150 },
  ],
};

/** The dialog's own props beside the shared form trio. */
interface Props {
  entry: TermsDto | null;
  minYear: number;
  suggestedYear: number;
  template: TermsDto | null;
}

function mountDialog(props: Partial<Props> = {}) {
  return mount(TermsFormDialog, {
    props: {
      open: true,
      submitting: false,
      error: null,
      entry: null,
      minYear: 2020,
      suggestedYear: 2026,
      template: previousYear,
      ...props,
    },
    attachTo: document.body,
  });
}

type Wrapper = ReturnType<typeof mountDialog>;

function textField(wrapper: Wrapper, label: string) {
  const field = wrapper
    .findAllComponents(EuTextField)
    .find((candidate) => candidate.props('label') === label);
  if (!field) throw new Error(`no text field labelled ${label}`);
  return field;
}

function currencyField(wrapper: Wrapper, label: string) {
  const field = wrapper
    .findAllComponents(EuCurrencyField)
    .find((candidate) => candidate.props('label') === label);
  if (!field) throw new Error(`no currency field labelled ${label}`);
  return field;
}

/** The payload the dialog hands its host, or undefined when it refused. */
function submitted(wrapper: Wrapper): TermsInput | undefined {
  const events = wrapper.emitted('submit');
  return events?.at(-1)?.[0] as TermsInput | undefined;
}

async function submit(wrapper: Wrapper): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('TermsFormDialog: taking the previous year over', () => {
  it('prefills from the template and names the year it came from', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain('Werte aus den Konditionen ab 2025 übernommen');
    expect(textField(wrapper, 'Gültig ab Jahr').props('modelValue')).toBe('2026');
    expect(currencyField(wrapper, 'Selbstbeteiligung pro Jahr').props('modelValue')).toBe(600);
    expect(
      currencyField(wrapper, 'Erstattungsobergrenze pro Jahr (leer = keine)').props('modelValue'),
    ).toBe(2000);
    expect(textField(wrapper, 'Erstattungssatz (%)').props('modelValue')).toBe('80');
    // The scale comes along — the reason a new entry exists at all.
    expect(wrapper.findAll('.eu-tiers__row')).toHaveLength(2);
  });

  it('submits the copied values under the new year, with the scale sorted', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    await submit(wrapper);

    expect(submitted(wrapper)).toEqual({
      validFromYear: 2026,
      deductible: 600,
      reimbursementCap: 2000,
      reimbursementRate: 80,
      // Entered 2 before 1 in the template; the API gets them in order.
      bonusTiers: [
        { claimFreeYears: 1, bonusAmount: 150 },
        { claimFreeYears: 2, bonusAmount: 300 },
      ],
    });
  });

  it('shows no takeover note when an existing entry is edited', async () => {
    const wrapper = mountDialog({ entry: previousYear });
    await flushPromises();

    expect(wrapper.text()).not.toContain('übernommen');
    expect(textField(wrapper, 'Gültig ab Jahr').props('modelValue')).toBe('2025');
  });

  it('starts empty when there is no previous year', async () => {
    const wrapper = mountDialog({ template: null, suggestedYear: 2020 });
    await flushPromises();

    expect(wrapper.text()).not.toContain('übernommen');
    expect(currencyField(wrapper, 'Selbstbeteiligung pro Jahr').props('modelValue')).toBe(null);
    expect(textField(wrapper, 'Erstattungssatz (%)').props('modelValue')).toBe('100');
    expect(wrapper.findAll('.eu-tiers__row')).toHaveLength(0);
  });

  it('refuses a year before the contract began, instead of sending it', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await textField(wrapper, 'Gültig ab Jahr').find('input').setValue('2019');

    await submit(wrapper);

    expect(submitted(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('Bitte ein Jahr ab 2020 (Vertragsbeginn) angeben.');
  });

  it('refuses the same number of claim-free years twice', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    const [first] = wrapper.findAll('.eu-tiers__row');
    await first.find('input').setValue('1');

    await submit(wrapper);

    expect(submitted(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain(
      'Jede Anzahl leistungsfreier Jahre darf nur einmal vorkommen.',
    );
  });

  it('refuses a scale step without an amount', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    const add = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Stufe hinzufügen'));
    await add?.trigger('click');

    await submit(wrapper);

    expect(submitted(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('Jede Bonus-Stufe braucht leistungsfreie Jahre (1–99)');
  });
});
