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
