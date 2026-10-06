import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { iban } from '../../lib/format';
import type { FieldConfig } from '../../resources/config';
import ResourceFormDialog from './ResourceFormDialog.vue';

/**
 * The classic create form. What is tested here is the one thing it decides on
 * its own: how a typed value becomes a payload — in particular a field with a
 * canonical written form (`normalize`), which an IBAN has (issues.md 0.15.0-1).
 */

const fields: FieldConfig[] = [
  { key: 'agencyName', type: 'text', required: true },
  { key: 'bankAccount', type: 'text', required: true, normalize: iban },
];

function mountForm() {
  return mount(ResourceFormDialog, {
    props: {
      open: true,
      title: 'Abrechnungsdienstleister anlegen',
      fields,
      options: {},
      submitting: false,
      error: null,
    },
  });
}

/** What the form handed its parent on the one save it was asked for. */
function submitted(wrapper: ReturnType<typeof mountForm>): Record<string, unknown> | undefined {
  return wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown> | undefined;
}

describe('ResourceFormDialog', () => {
  it('sends the printed form it shows, even when the field was never left', async () => {
    const wrapper = mountForm();
    const inputs = wrapper.findAll('.eu-text-field__input');
    await inputs[0].setValue('Inkasso Abschrift');
    // Typed and submitted with Enter: no blur ever happens, so the normalising
    // on save is the only thing standing between this and the raw text. What
    // goes over the wire is the printed form; the API reduces it to the number.
    await inputs[1].setValue('de02  1203 0000 0000 2020 51');

    await wrapper.find('form').trigger('submit');

    expect(submitted(wrapper)?.bankAccount).toBe('DE02 1203 0000 0000 2020 51');
    wrapper.unmount();
  });

  it('writes the value out when the field is left, before any save', async () => {
    const wrapper = mountForm();
    const ibanInput = wrapper.findAll('.eu-text-field__input')[1];
    await ibanInput.setValue('de02120300000000202051');
    await ibanInput.trigger('blur');

    expect((ibanInput.element as HTMLInputElement).value).toBe('DE02 1203 0000 0000 2020 51');
    wrapper.unmount();
  });

  it('asks for a required field that is still empty, naming it', async () => {
    const wrapper = mountForm();

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('.eu-form__error').text()).toBe('Bitte „Name“ ausfüllen.');
    wrapper.unmount();
  });
});
