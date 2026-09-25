import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import EuDetailField from './EuDetailField.vue';

/**
 * The add action of a display-mask row. Unlike the create form, the mask keeps
 * its actions in their own column (dialog-design.md), so the button sits
 * outside the picker and has to be handed the text typed into it.
 */
const addAction = (wrapper: ReturnType<typeof mountField>, noun: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === `${noun} hinzufügen`);

const options = [{ value: 'f-1', label: 'Praxis Nord' }];

/** A paste as the browser sends it, so `defaultPrevented` can be read after. */
function paste(el: Element, text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  el.dispatchEvent(event);
  return event;
}

function mountField(props: Record<string, unknown> = {}) {
  return mount(EuDetailField, {
    props: {
      label: 'Leistungserbringer',
      type: 'select',
      options,
      modelValue: null,
      ...props,
    },
  });
}

describe('EuDetailField ad-hoc create', () => {
  it('offers no add action unless the row allows creating', () => {
    const wrapper = mountField();
    expect(addAction(wrapper, 'Leistungserbringer')).toBeUndefined();
  });

  it('carries the text typed into the picker into the create request', async () => {
    const wrapper = mountField({ allowCreate: true, createNoun: 'Leistungserbringer' });
    await wrapper.find('input').setValue('  Praxis Süd  ');
    await addAction(wrapper, 'Leistungserbringer')?.trigger('click');
    expect(wrapper.emitted('create')).toEqual([['Praxis Süd']]);
  });

  it('is switched off with the row it belongs to (agency under direct payment)', () => {
    const wrapper = mountField({
      label: 'Abrechnungsdienstleister',
      allowCreate: true,
      createNoun: 'Abrechnungsdienstleister',
      disabled: true,
    });
    expect(addAction(wrapper, 'Abrechnungsdienstleister')?.attributes('disabled')).toBeDefined();
  });
});

describe('EuDetailField date row', () => {
  it('takes a German date pasted into it as ISO', () => {
    const wrapper = mountField({ label: 'Rechnungsdatum', type: 'date', modelValue: '' });
    const event = paste(wrapper.find('input').element, '24.09.2026');

    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-09-24']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a paste it cannot read to the browser', () => {
    const wrapper = mountField({ label: 'Rechnungsdatum', type: 'date', modelValue: '' });
    const event = paste(wrapper.find('input').element, '24.09.26');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('EuDetailField toggle row', () => {
  it('names the switch for a screen reader although the mask prints the label itself', () => {
    const wrapper = mountField({ label: 'Direkt-/Barzahlung', type: 'toggle', modelValue: false });
    const input = wrapper.find('input[type="checkbox"]');

    expect(input.attributes('aria-label')).toBe('Direkt-/Barzahlung');
    // The visible label column already carries the text — twice would be noise.
    expect(wrapper.find('.eu-toggle__label').exists()).toBe(false);
  });
});
