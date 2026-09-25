import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import EuDialog from './EuDialog.vue';

describe('EuDialog', () => {
  it('shows a dialog that is already open when it is mounted', () => {
    // The case that a v-if produces: the component appears in the same tick in
    // which `open` becomes true, so there is no change for a watcher to see.
    const wrapper = mount(EuDialog, {
      props: { open: true, title: 'Abrechnung bearbeiten' },
      attachTo: document.body,
    });

    expect(wrapper.find<HTMLDialogElement>('dialog').element.open).toBe(true);
    wrapper.unmount();
  });

  it('opens and closes as the prop changes', async () => {
    const wrapper = mount(EuDialog, {
      props: { open: false, title: 'Abrechnung bearbeiten' },
      attachTo: document.body,
    });
    const dialog = wrapper.find<HTMLDialogElement>('dialog').element;
    expect(dialog.open).toBe(false);

    await wrapper.setProps({ open: true });
    expect(dialog.open).toBe(true);

    await wrapper.setProps({ open: false });
    expect(dialog.open).toBe(false);
    wrapper.unmount();
  });

  it('starts at the top again when it is reopened', async () => {
    // The dialog stays mounted between opens, so the body keeps the offset it
    // was left with unless something resets it — the finding from production
    // (issues.md 13): the form was worked through to the bottom, and the next
    // one opened down there while the focus sat in the first field. Whether the
    // engine drops the offset over `display: none` is not ours to rely on, so
    // the component makes it a rule.
    const wrapper = mount(EuDialog, {
      props: { open: true, title: 'Rechnung anlegen' },
      slots: { default: '<input aria-label="Rechnungsnummer" />' },
      attachTo: document.body,
    });
    const body = wrapper.find<HTMLElement>('.eu-dialog__body').element;

    body.scrollTop = 240;
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();

    expect(body.scrollTop).toBe(0);
    wrapper.unmount();
  });
});
