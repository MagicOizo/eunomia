import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { withFormat } from '../../test/locale';
import EuCurrencyField from './EuCurrencyField.vue';

function mountField(modelValue: number | null) {
  return mount(EuCurrencyField, { props: { modelValue, label: 'Betrag' } });
}

/** Where the € sits relative to the input. */
function symbolSide(wrapper: ReturnType<typeof mountField>): string {
  const children = [...wrapper.get('.eu-currency-field__control').element.children];
  const symbol = children.findIndex((child) =>
    child.classList.contains('eu-currency-field__symbol'),
  );
  return symbol < children.findIndex((child) => child.tagName === 'INPUT') ? 'in front' : 'behind';
}

/** Types into the field the way a user does: focus, text, blur. */
async function type(wrapper: ReturnType<typeof mountField>, text: string): Promise<unknown> {
  const input = wrapper.get('input');
  await input.trigger('focus');
  await input.setValue(text);
  await input.trigger('blur');
  const emitted = wrapper.emitted('update:modelValue') ?? [];
  return emitted[emitted.length - 1]?.[0];
}

describe('EuCurrencyField', () => {
  it('shows and reads the German format: comma decimal, € behind', async () => {
    const wrapper = mountField(1234.5);
    expect(wrapper.get('input').element.value).toBe('1.234,50');
    expect(symbolSide(wrapper)).toBe('behind');

    expect(await type(wrapper, '1.234,56')).toBe(1234.56);
    expect(await type(wrapper, '12.5')).toBe(12.5); // no comma: the dot is the decimal mark
  });

  it('edits with the decimal mark of the format', async () => {
    const wrapper = mountField(12.5);
    await wrapper.get('input').trigger('focus');
    expect(wrapper.get('input').element.value).toBe('12,5');
  });

  it('shows and reads the British format: point decimal, comma thousands, € in front', async () => {
    await withFormat('en-GB', async () => {
      const wrapper = mountField(1234.5);
      expect(wrapper.get('input').element.value).toBe('1,234.50');
      expect(symbolSide(wrapper)).toBe('in front');

      expect(await type(wrapper, '1,234.56')).toBe(1234.56);
      expect(await type(wrapper, '1,234')).toBe(1234);

      await wrapper.get('input').trigger('focus');
      expect(wrapper.get('input').element.value).toBe('1234.5'); // the prop, not what was typed
    });
  });

  it('reformats an idle field when the format changes', async () => {
    const wrapper = mountField(45);
    expect(wrapper.get('input').element.value).toBe('45,00');
    await withFormat('en-US', async () => {
      await wrapper.vm.$nextTick();
      expect(wrapper.get('input').element.value).toBe('45.00');
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('input').element.value).toBe('45,00');
  });
});
