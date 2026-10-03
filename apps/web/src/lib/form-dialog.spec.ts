import { effectScope, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import { useFormDialog, type FormDialog, type FormDialogProps } from './form-dialog';

let scope: ReturnType<typeof effectScope> | null = null;

/**
 * The composable runs in a component in the app; here a scope stands in for one
 * so its watcher is disposed with the test instead of outliving it.
 */
function mount(
  props: FormDialogProps & { invoiceUID?: string },
  reset?: () => void,
  key?: () => unknown,
): FormDialog {
  scope = effectScope();
  const form = scope.run(() => useFormDialog(props, reset, key));
  if (!form) throw new Error('scope did not run');
  return form;
}

afterEach(() => {
  scope?.stop();
  scope = null;
});

describe('useFormDialog', () => {
  it('fills the fields when the dialog opens, and again on the next open', async () => {
    const props = reactive<FormDialogProps>({ open: false, submitting: false, error: null });
    let fills = 0;
    mount(props, () => fills++);
    expect(fills).toBe(0);

    props.open = true;
    await nextTick();
    expect(fills).toBe(1);

    props.open = false;
    await nextTick();
    props.open = true;
    await nextTick();
    expect(fills).toBe(2);
  });

  it('leaves the fields alone while the dialog closes', async () => {
    const props = reactive<FormDialogProps>({ open: true, submitting: false, error: null });
    let fills = 0;
    mount(props, () => fills++);
    expect(fills).toBe(1); // immediate: a dialog mounted open is seeded at once

    props.open = false;
    await nextTick();
    expect(fills).toBe(1);
  });

  it('fills again when the record behind the dialog changes while it stays open', async () => {
    const props = reactive({ open: true, submitting: false, error: null, invoiceUID: 'i-1' });
    const seeded: string[] = [];
    mount(
      props,
      () => seeded.push(props.invoiceUID),
      () => props.invoiceUID,
    );
    expect(seeded).toEqual(['i-1']);

    props.invoiceUID = 'i-2';
    await nextTick();
    expect(seeded).toEqual(['i-1', 'i-2']);
  });

  it("shows the host's error before its own", () => {
    const props = reactive<FormDialogProps>({ open: true, submitting: false, error: null });
    const form = mount(props);

    form.fail('Bitte ein Zahlungsdatum wählen.');
    expect(form.shownError.value).toBe('Bitte ein Zahlungsdatum wählen.');

    props.error = 'Die Aktion ist fehlgeschlagen.';
    expect(form.shownError.value).toBe('Die Aktion ist fehlgeschlagen.');

    form.clear();
    expect(form.shownError.value).toBe('Die Aktion ist fehlgeschlagen.');
    props.error = null;
    expect(form.shownError.value).toBe(null);
  });

  it('drops its own complaint when the dialog is opened again', async () => {
    const props = reactive<FormDialogProps>({ open: false, submitting: false, error: null });
    const form = mount(props);
    form.fail('Bitte die Police wählen.');

    props.open = true;
    await nextTick();
    expect(form.shownError.value).toBe(null);
  });
});
