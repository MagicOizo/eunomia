import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';

import EuDetailField from './EuDetailField.vue';
import EuDetailMask from './EuDetailMask.vue';

/**
 * The add action of a display-mask row. Unlike the create form, the mask keeps
 * its actions in their own column (dialog-design.md), so the button sits
 * outside the picker and has to be handed the text typed into it.
 */
const addAction = (wrapper: ReturnType<typeof mountField>, noun: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === `${noun} hinzufügen`);

const options = [{ value: 'f-1', label: 'Praxis Nord' }];

/** What Intl puts between amount and currency sign (see @eunomia/shared). */
const NBSP = '\u00a0';

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

/**
 * A read-only mask (CR-26: a record its reader may not write) turns every row
 * into text. The value then has to say for itself what its editor said for it.
 */
describe('EuDetailField in a read-only mask', () => {
  /** One row of the given type, inside a mask that is read-only. */
  function mountInReadonlyMask(props: Record<string, unknown>) {
    return mount(EuDetailMask, {
      props: { readonly: true },
      slots: { default: h(EuDetailField, { label: 'Feld', options, ...props }) },
    });
  }

  it('writes a date the way this country writes it', () => {
    const wrapper = mountInReadonlyMask({ type: 'date', modelValue: '1985-04-12' });

    expect(wrapper.find('.eu-detail__readonly').text()).toBe('12.04.1985');
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('names the record a relation points at, not its UID', () => {
    const wrapper = mountInReadonlyMask({ type: 'select', modelValue: 'f-1' });

    expect(wrapper.find('.eu-detail__readonly').text()).toBe('Praxis Nord');
  });

  it('says an amount and a switch in words', () => {
    expect(
      mountInReadonlyMask({ type: 'currency', modelValue: 120 })
        .find('.eu-detail__readonly')
        .text(),
    ).toBe(`120,00${NBSP}€`);
    expect(
      mountInReadonlyMask({ type: 'toggle', modelValue: true }).find('.eu-detail__readonly').text(),
    ).toBe('Ja');
  });

  it('keeps no action in the row', () => {
    const wrapper = mountInReadonlyMask({ type: 'text', modelValue: 'Praxis Nord' });

    expect(wrapper.findAll('button')).toHaveLength(0);
  });
});
