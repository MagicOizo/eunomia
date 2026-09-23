import { type VueWrapper, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { FieldConfig } from '../../resources/config';
import ResourceDetailDialog from './ResourceDetailDialog.vue';

const fields: FieldConfig[] = [
  { key: 'facilityName', label: 'Name', type: 'text', required: true },
  { key: 'note', label: 'Notiz', type: 'text' },
  { key: 'distanceKm', label: 'Entfernung (km)', type: 'number', step: '1' },
  { key: 'companyUID', label: 'Versicherung', type: 'select', optionsFrom: 'companies' },
  {
    key: 'accountUID',
    label: 'Versicherter',
    type: 'select',
    immutable: true,
    optionsFrom: 'accounts',
  },
];

const props = {
  open: true,
  title: 'Leistungserbringer: Hausarztpraxis',
  fields,
  options: {
    companies: [{ value: 'c-1', label: 'AXA' }],
    accounts: [{ value: 'a-1', label: 'Clara Beispiel' }],
  },
  editing: {
    facilityUID: 'f-1',
    facilityName: 'Hausarztpraxis',
    note: 'Nur Vorsorge',
    distanceKm: 12,
    companyUID: 'c-1',
    accountUID: 'a-1',
  },
  submitting: false,
  error: null,
};

function openDialog(overrides: Record<string, unknown> = {}) {
  return mount(ResourceDetailDialog, {
    props: { ...props, ...overrides },
    attachTo: document.body,
  });
}

/** The row of the mask whose label matches, with its two action buttons. */
function row(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAllComponents({ name: 'EuDetailField' })
    .find((c) => c.props('label') === label);
  if (!field) throw new Error(`no row labelled ${label}`);
  const [clear, reset] = field.findAll('button');
  return { field, clear, reset };
}

describe('ResourceDetailDialog', () => {
  it('shows one mask row per field, with the relation resolved to its label', () => {
    const wrapper = openDialog();

    expect(wrapper.findAllComponents({ name: 'EuDetailField' })).toHaveLength(fields.length);
    const name = wrapper.find<HTMLInputElement>('input[aria-label="Name"]');
    expect(name.element.value).toBe('Hausarztpraxis');
    // The immutable relation reads as text (its label, not the UID) and has no actions.
    const insured = row(wrapper, 'Versicherter');
    expect(insured.field.text()).toContain('Clara Beispiel');
    expect(insured.field.findAll('button')).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps Clear disabled on a required field and clears an optional one to null', async () => {
    const wrapper = openDialog();

    expect(row(wrapper, 'Name').clear.attributes('disabled')).toBeDefined();

    await row(wrapper, 'Notiz').clear.trigger('click');
    await row(wrapper, 'Entfernung (km)').clear.trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Speichern')
      ?.trigger('click');

    expect(wrapper.emitted('submit')?.[0][0]).toEqual({
      facilityName: 'Hausarztpraxis',
      note: null,
      distanceKm: null,
      companyUID: 'c-1',
      // The immutable field is not part of the payload.
    });
    wrapper.unmount();
  });

  it('enables Reset only after a change and restores the saved value', async () => {
    const wrapper = openDialog();
    expect(row(wrapper, 'Name').reset.attributes('disabled')).toBeDefined();

    await wrapper.find('input[aria-label="Name"]').setValue('Zahnarztpraxis');
    const changed = row(wrapper, 'Name');
    expect(changed.reset.attributes('disabled')).toBeUndefined();

    await changed.reset.trigger('click');
    expect(wrapper.find<HTMLInputElement>('input[aria-label="Name"]').element.value).toBe(
      'Hausarztpraxis',
    );
    wrapper.unmount();
  });

  it('asks for a missing required value instead of saving', async () => {
    const wrapper = openDialog();

    await wrapper.find('input[aria-label="Name"]').setValue('   ');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Speichern')
      ?.trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('Name');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = openDialog();

    const results = await axe.run(wrapper.element as HTMLElement);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
