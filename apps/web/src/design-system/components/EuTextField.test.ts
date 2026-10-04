import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { iban } from '../../lib/format';
import EuTextField from './EuTextField.vue';

/**
 * A native date input drops a pasted `24.09.2026` without a word (verified in
 * Chromium), so the field converts the German notation itself.
 */
function paste(el: Element, text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  el.dispatchEvent(event);
  return event;
}

describe('EuTextField pasting a date', () => {
  it('takes a German date into a date field as ISO', () => {
    const wrapper = mount(EuTextField, {
      props: { modelValue: '', label: 'Rechnungsdatum', type: 'date' },
    });
    const event = paste(wrapper.find('input').element, '24.09.2026');

    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-09-24']]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets an unusable paste run as the browser would', () => {
    const wrapper = mount(EuTextField, {
      props: { modelValue: '', label: 'Rechnungsdatum', type: 'date' },
    });
    const event = paste(wrapper.find('input').element, 'morgen früh');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps its hands off a text field', () => {
    const wrapper = mount(EuTextField, { props: { modelValue: '', label: 'Notiz' } });
    const event = paste(wrapper.find('input').element, '24.09.2026');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });
});

/**
 * The browser's own suggestions and prefills are off everywhere (issues.md
 * 0.11.0 2) -- except where a password manager is supposed to recognise the
 * field, which is why the default can be overridden at all.
 */
describe("EuTextField and the browser's suggestions", () => {
  it('turns them off unless asked otherwise', () => {
    const wrapper = mount(EuTextField, { props: { modelValue: '', label: 'Rechnungsnummer' } });

    expect(wrapper.find('input').attributes('autocomplete')).toBe('off');
  });

  it('passes a named token through, so the login form keeps its prefill', () => {
    const wrapper = mount(EuTextField, {
      props: {
        modelValue: '',
        label: 'Passwort',
        type: 'password',
        autocomplete: 'current-password',
      },
    });

    expect(wrapper.find('input').attributes('autocomplete')).toBe('current-password');
  });
});

/**
 * A value with a printed form of its own (an IBAN) is written out when the
 * field is left — not while typing, where it would move the caret under the
 * user's hands (issues.md 0.15.0-1).
 */
describe('EuTextField and a canonical written form', () => {
  it('writes the value out in its printed form when the field is left', async () => {
    const wrapper = mount(EuTextField, {
      props: { modelValue: 'de02120300000000202051', label: 'IBAN', normalize: iban },
    });

    await wrapper.find('input').trigger('blur');

    expect(wrapper.emitted('update:modelValue')).toEqual([['DE02 1203 0000 0000 2020 51']]);
  });

  it('says nothing when the value already stands in that form', async () => {
    const wrapper = mount(EuTextField, {
      props: { modelValue: 'DE02 1203 0000 0000 2020 51', label: 'IBAN', normalize: iban },
    });

    await wrapper.find('input').trigger('blur');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps out of the typing itself', async () => {
    const wrapper = mount(EuTextField, {
      props: { modelValue: '', label: 'IBAN', normalize: iban },
    });

    await wrapper.find('input').setValue('de02 1203');

    // What the user typed, untouched — the grouping comes later.
    expect(wrapper.emitted('update:modelValue')).toEqual([['de02 1203']]);
  });

  it('leaves a field without a printed form as quiet as it was', async () => {
    const wrapper = mount(EuTextField, { props: { modelValue: ' Notiz ', label: 'Notiz' } });

    await wrapper.find('input').trigger('blur');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
