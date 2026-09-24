import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

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
});
