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
