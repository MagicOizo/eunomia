import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

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
