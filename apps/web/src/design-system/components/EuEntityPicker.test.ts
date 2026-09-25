import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import EuEntityPicker from './EuEntityPicker.vue';

const options = [
  { value: 'f-1', label: 'Praxis Nord' },
  { value: 'f-2', label: 'Praxis Süd' },
];

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(EuEntityPicker, {
    props: { label: 'Leistungserbringer', options, modelValue: null, ...props },
  });
}

const listOpen = (wrapper: ReturnType<typeof mountPicker>) =>
  wrapper.find('[role="listbox"]').exists();
const optionLabels = (wrapper: ReturnType<typeof mountPicker>) =>
  wrapper.findAll('.eu-picker__opt-label').map((o) => o.text());

/** Tab as the browser sends it, so `defaultPrevented` can be read afterwards. */
function pressTab(el: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe('EuEntityPicker opening the list', () => {
  it('stays closed on focus alone — a picker tabbed through shows nothing', async () => {
    const wrapper = mountPicker();
    await wrapper.find('input').trigger('focus');

    expect(listOpen(wrapper)).toBe(false);
  });

  it('opens on a click, unfiltered', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.trigger('click');

    expect(optionLabels(wrapper)).toEqual(['Praxis Nord', 'Praxis Süd']);
  });

  it('opens filtered while typing, and with ArrowDown from the closed state', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Süd');
    expect(optionLabels(wrapper)).toEqual(['Praxis Süd']);

    const fresh = mountPicker();
    await fresh.find('input').trigger('focus');
    await fresh.find('input').trigger('keydown', { key: 'ArrowDown' });
    expect(listOpen(fresh)).toBe(true);
  });

  it('forgets the search text between visits and shows the picked label at rest', async () => {
    const wrapper = mountPicker({ modelValue: 'f-1' });
    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('Praxis Nord');

    await input.trigger('focus');
    await input.setValue('Süd');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('Praxis Nord');

    await input.trigger('focus');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect((input.element as HTMLInputElement).placeholder).toBe('Praxis Nord');
    expect(listOpen(wrapper)).toBe(false);
  });
});

describe('EuEntityPicker leaving with Tab', () => {
  it('takes the typed match along and lets the focus move on by itself', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    const blur = vi.spyOn(input.element as HTMLInputElement, 'blur');
    await input.trigger('focus');
    await input.setValue('Praxis');

    const event = pressTab(input.element);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')).toEqual([['f-1']]);
    expect(event.defaultPrevented).toBe(false);
    expect(blur).not.toHaveBeenCalled();
    expect(listOpen(wrapper)).toBe(false);
  });

  it('takes the entry moved to with the arrow keys', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.trigger('click');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'ArrowDown' });

    pressTab(input.element);

    expect(wrapper.emitted('update:modelValue')).toEqual([['f-2']]);
  });

  it('changes nothing when the list never opened', async () => {
    const wrapper = mountPicker({ modelValue: 'f-1' });
    const input = wrapper.find('input');
    await input.trigger('focus');

    pressTab(input.element);

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('does not spring the create dialog open on the way past', async () => {
    const wrapper = mountPicker({ allowCreate: true, createNoun: 'Leistungserbringer' });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Praxis West');
    expect(wrapper.find('.eu-picker__option--create').exists()).toBe(true);

    pressTab(input.element);

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('EuEntityPicker choosing with Enter', () => {
  it('takes the highlighted entry and gives up the focus', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    const blur = vi.spyOn(input.element as HTMLInputElement, 'blur');
    await input.trigger('focus');
    await input.setValue('Süd');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')).toEqual([['f-2']]);
    expect(blur).toHaveBeenCalled();
  });

  it('asks for the create dialog on the create row', async () => {
    const wrapper = mountPicker({ allowCreate: true, createNoun: 'Leistungserbringer' });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Praxis West');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('create')).toEqual([['Praxis West']]);
  });

  it('does nothing while the open list has no highlight', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.trigger('click');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('EuEntityPicker dismissing with Escape', () => {
  it('closes the list and keeps the dialog around it open', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Süd');

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(listOpen(wrapper)).toBe(false);
    // A native <dialog> closes on the key itself — unprevented, Escape would
    // take the whole form with it.
    expect(event.defaultPrevented).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('leaves Escape to the dialog once the list is closed', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
