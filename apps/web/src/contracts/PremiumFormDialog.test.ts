import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import PremiumFormDialog from './PremiumFormDialog.vue';
import type { PremiumDto, PremiumInput } from './api';

/**
 * A premium carries two figures since Slice 76: the full monthly premium (cost
 * information) and the bonus-relevant part the factor steps multiply. Either
 * may stay empty, but not both.
 */

function mountDialog(entry: PremiumDto | null = null) {
  return mount(PremiumFormDialog, {
    props: { open: true, submitting: false, error: null, entry, minDate: '2020-01-01' },
    attachTo: document.body,
  });
}

type Wrapper = ReturnType<typeof mountDialog>;

async function fill(wrapper: Wrapper, label: string, value: number | null): Promise<void> {
  const field = wrapper
    .findAllComponents(EuCurrencyField)
    .find((candidate) => candidate.props('label') === label);
  if (!field) throw new Error(`no currency field labelled ${label}`);
  field.vm.$emit('update:modelValue', value);
  await flushPromises();
}

async function submit(wrapper: Wrapper): Promise<PremiumInput | undefined> {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  return wrapper.emitted('submit')?.at(-1)?.[0] as PremiumInput | undefined;
}

describe('PremiumFormDialog', () => {
  it('sends only the bonus-relevant premium when the full one is unknown', async () => {
    const wrapper = mountDialog();
    await wrapper.find('input[type="date"]').setValue('2024-07-01');
    await fill(wrapper, 'Bonusrelevanter Monatsbeitrag', 410);

    expect(await submit(wrapper)).toEqual({
      validFrom: '2024-07-01',
      monthlyPremium: null,
      bonusRelevantPremium: 410,
      note: null,
    });
    wrapper.unmount();
  });

  it('refuses an entry without either figure', async () => {
    const wrapper = mountDialog();
    await wrapper.find('input[type="date"]').setValue('2024-07-01');

    expect(await submit(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('den bonusrelevanten Beitrag oder beide');
    wrapper.unmount();
  });

  it('prefills both figures when an entry is edited', async () => {
    const wrapper = mountDialog({
      premiumUID: 'p-1',
      validFrom: '2024-01-01',
      validTo: null,
      monthlyPremium: 520,
      bonusRelevantPremium: 400,
      note: null,
    });
    await flushPromises();
    const values = wrapper.findAllComponents(EuCurrencyField).map((f) => f.props('modelValue'));
    expect(values).toEqual([520, 400]);
    wrapper.unmount();
  });
});
