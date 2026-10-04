import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import EuSuggestedDateField from './EuSuggestedDateField.vue';

const suggestions = [
  { value: '2020-03-01', label: 'sofort', hint: '01.03.2020' },
  { value: '2020-03-15', label: '14 Tage', hint: '15.03.2020' },
  { value: '2020-03-16', label: '15 Tage', hint: '16.03.2020' },
  { value: '2020-03-31', label: '30 Tage', hint: '31.03.2020' },
];

function mountField(props: Record<string, unknown> = {}) {
  return mount(EuSuggestedDateField, {
    props: {
      modelValue: '',
      label: 'Zahlungsziel',
      suggestions,
      suggestionsLabel: 'Typische Zahlungsziele',
      ...props,
    },
    // The focus has to really move for the roving Tab stop and for focusout.
    attachTo: document.body,
  });
}

type Field = ReturnType<typeof mountField>;

const listOpen = (wrapper: Field): boolean => wrapper.find('[role="group"]').exists();
const optionLabels = (wrapper: Field): string[] =>
  wrapper.findAll('.eu-date-suggest__label').map((o) => o.text());
/** Which entry carries the one Tab stop of the list. */
const tabStop = (wrapper: Field): string | undefined =>
  wrapper
    .findAll('.eu-date-suggest__option')
    .find((button) => button.attributes('tabindex') === '0')
    ?.text();

/** The focus arriving in the field, as a browser sends it (focus does not bubble). */
async function focusField(wrapper: Field): Promise<void> {
  const input = wrapper.find('input').element as HTMLInputElement;
  input.focus();
  await wrapper.find('input').trigger('focusin');
}

describe('EuSuggestedDateField opening the list', () => {
  it('opens on focus — four suggested dates fit under the field', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    expect(listOpen(wrapper)).toBe(true);
    expect(optionLabels(wrapper)).toEqual(['sofort', '14 Tage', '15 Tage', '30 Tage']);
    wrapper.unmount();
  });

  it('shows the date each step works out to', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    expect(wrapper.findAll('.eu-date-suggest__option')[1].text()).toContain('15.03.2020');
    wrapper.unmount();
  });

  it('stays away while there is nothing to suggest', async () => {
    const wrapper = mountField({ suggestions: [] });
    await focusField(wrapper);
    await wrapper.find('input').trigger('click');

    expect(listOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('closes a standing list when the last suggestion goes', async () => {
    // The invoice date was cleared: an empty box over the form is worse than none.
    const wrapper = mountField();
    await focusField(wrapper);
    expect(listOpen(wrapper)).toBe(true);

    await wrapper.setProps({ suggestions: [] });

    expect(listOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('closes when the focus leaves the field altogether', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    await wrapper.find('input').trigger('focusout', { relatedTarget: document.body });

    expect(listOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('stays open while the focus moves from the field into the list', async () => {
    const wrapper = mountField();
    await focusField(wrapper);
    const option = wrapper.findAll('.eu-date-suggest__option')[0].element;

    await wrapper.find('input').trigger('focusout', { relatedTarget: option });

    expect(listOpen(wrapper)).toBe(true);
    wrapper.unmount();
  });
});

describe('EuSuggestedDateField picking a date', () => {
  it('takes the step as the field value and closes', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    await wrapper.findAll('.eu-date-suggest__option')[1].trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['2020-03-15']]);
    expect(listOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('leaves the list shut afterwards, although the focus is back in the field', async () => {
    const wrapper = mountField();
    await focusField(wrapper);
    await wrapper.findAll('.eu-date-suggest__option')[0].trigger('click');

    // The pick hands the focus back; without the bolt the list would reopen here.
    await wrapper.find('input').trigger('focusin');

    expect(listOpen(wrapper)).toBe(false);
    wrapper.unmount();
  });

  it('opens again on a click in the field — a click is a request', async () => {
    const wrapper = mountField();
    await focusField(wrapper);
    await wrapper.findAll('.eu-date-suggest__option')[0].trigger('click');

    await wrapper.find('input').trigger('click');

    expect(listOpen(wrapper)).toBe(true);
    wrapper.unmount();
  });

  it('keeps typing in the field working as before', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    await wrapper.find('input').setValue('2020-04-02');

    expect(wrapper.emitted('update:modelValue')).toEqual([['2020-04-02']]);
    wrapper.unmount();
  });
});

describe('EuSuggestedDateField and the keyboard', () => {
  it('is one Tab stop: only the active entry is tabbable', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    const tabbable = wrapper
      .findAll('.eu-date-suggest__option')
      .filter((button) => button.attributes('tabindex') === '0');

    expect(tabbable).toHaveLength(1);
    expect(tabStop(wrapper)).toContain('sofort');
    wrapper.unmount();
  });

  it('moves the stop and the focus with the arrows, round the ends', async () => {
    const wrapper = mountField();
    await focusField(wrapper);
    const options = wrapper.findAll('.eu-date-suggest__option');
    (options[0].element as HTMLButtonElement).focus();

    await options[0].trigger('keydown', { key: 'ArrowDown' });
    expect(tabStop(wrapper)).toContain('14 Tage');
    expect(document.activeElement).toBe(options[1].element);

    await options[1].trigger('keydown', { key: 'ArrowUp' });
    expect(tabStop(wrapper)).toContain('sofort');

    // Wrapping round rather than stopping dead at the ends.
    await options[0].trigger('keydown', { key: 'ArrowUp' });
    expect(tabStop(wrapper)).toContain('30 Tage');
    wrapper.unmount();
  });

  it('takes Home and End to the ends of the list', async () => {
    const wrapper = mountField();
    await focusField(wrapper);
    const options = wrapper.findAll('.eu-date-suggest__option');

    await options[0].trigger('keydown', { key: 'End' });
    expect(tabStop(wrapper)).toContain('30 Tage');

    await options[3].trigger('keydown', { key: 'Home' });
    expect(tabStop(wrapper)).toContain('sofort');
    wrapper.unmount();
  });

  it('leaves the arrow keys in the field to the browser, which steps the date', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    wrapper.find('input').element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(listOpen(wrapper)).toBe(true);
    wrapper.unmount();
  });

  it('closes on Escape without changing the value, and keeps the dialog out of it', async () => {
    const wrapper = mountField();
    await focusField(wrapper);

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    wrapper.find('input').element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(listOpen(wrapper)).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    // Stopped and cancelled: the surrounding <dialog> must not read it as "close".
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('lets Escape through once the list is closed — then the dialog owns it', async () => {
    const wrapper = mountField({ suggestions: [] });
    await focusField(wrapper);

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    wrapper.find('input').element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    wrapper.unmount();
  });
});
