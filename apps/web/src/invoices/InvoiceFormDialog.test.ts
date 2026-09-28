import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import InvoiceFormDialog from './InvoiceFormDialog.vue';
import { reasonRequiredMessage } from './not-covered';
import { differentYearsMessage } from './treatment-days';

/** The create form with the minimum a save needs, minus the treatment days. */
function mountForm() {
  return mount(InvoiceFormDialog, {
    props: {
      open: true,
      editing: null,
      accountUID: 'a-1',
      facilities: [],
      agencies: [],
      submitting: false,
      error: null,
    },
  });
}

type Form = ReturnType<typeof mountForm>;

/** Fills the fields every save needs, the leading treatment day included. */
async function fillRequired(wrapper: Form, treatmentDate: string): Promise<void> {
  const text = wrapper.findAll('.eu-text-field__input');
  await text[0].setValue('R-1');
  await text[1].setValue('2020-03-01');
  await text[2].setValue(treatmentDate);
  await wrapper.find('input[inputmode="decimal"]').setValue('100');
}

/** Clicks "Behandlungstag hinzufügen" and hands back the rows that now stand. */
async function addDay(wrapper: Form) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Behandlungstag hinzufügen'));
  await button!.trigger('click');
  await flushPromises();
  return wrapper.findAll('.eu-form__day input');
}

/** What the dialog handed its parent on the one save it was asked for. */
function submitted(wrapper: Form): Record<string, unknown> | undefined {
  return wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown> | undefined;
}

describe('InvoiceFormDialog treatment days', () => {
  it('sends every day it was given, sorted, with the earliest leading', async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-02-10');

    await addDay(wrapper);
    const rows = await addDay(wrapper);
    expect(rows).toHaveLength(2);
    await rows[0].setValue('2020-02-17');
    await rows[1].setValue('2020-02-03');

    await wrapper.find('form').trigger('submit');

    expect(submitted(wrapper)?.treatmentDates).toEqual(['2020-02-03', '2020-02-10', '2020-02-17']);
    // The leading day goes along unchanged — the API picks the earliest itself.
    expect(submitted(wrapper)?.treatmentDate).toBe('2020-02-10');

    wrapper.unmount();
  });

  it('drops a row that was added but never filled in', async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-02-10');
    expect(await addDay(wrapper)).toHaveLength(1);

    await wrapper.find('form').trigger('submit');

    expect(submitted(wrapper)?.treatmentDates).toEqual(['2020-02-10']);

    wrapper.unmount();
  });

  it("refuses a day from another calendar year with the API's own sentence", async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-12-28');
    const rows = await addDay(wrapper);
    await rows[0].setValue('2021-01-04');

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toBe(differentYearsMessage());

    wrapper.unmount();
  });
});

describe('InvoiceFormDialog "nicht gedeckt"', () => {
  /** The field of the row whose label starts with `label`. */
  function fieldOf(wrapper: Form, label: string) {
    const field = wrapper
      .findAll('.eu-text-field')
      .find((candidate) => candidate.find('label').text().startsWith(label));
    return field?.find('input');
  }

  /** Flips the mark; it is the second switch of the form after Direktzahlung. */
  async function markNotCovered(wrapper: Form): Promise<void> {
    await wrapper.findAll('.eu-toggle__input')[1].setValue(true);
    await flushPromises();
  }

  it("asks for a reason before it saves, in the API's own words", async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-02-10');
    await markNotCovered(wrapper);

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toBe(reasonRequiredMessage());

    wrapper.unmount();
  });

  it('sends the mark with its reason', async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-02-10');
    await markNotCovered(wrapper);
    await fieldOf(wrapper, 'Begründung')?.setValue('  Kosmetische Behandlung  ');

    await wrapper.find('form').trigger('submit');

    expect(submitted(wrapper)?.notCovered).toBe(true);
    expect(submitted(wrapper)?.notCoveredReason).toBe('Kosmetische Behandlung');

    wrapper.unmount();
  });

  it('leaves the reason out while the mark is not set', async () => {
    const wrapper = mountForm();
    await fillRequired(wrapper, '2020-02-10');
    // The row is not even there to fill in.
    expect(fieldOf(wrapper, 'Begründung')).toBeUndefined();

    await wrapper.find('form').trigger('submit');

    expect(submitted(wrapper)?.notCovered).toBe(false);
    expect(submitted(wrapper)?.notCoveredReason).toBeNull();

    wrapper.unmount();
  });
});
