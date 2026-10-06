import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import PaymentQrPopover from './PaymentQrPopover.vue';

const props = {
  recipient: 'Beispiel Inkasso GmbH',
  iban: 'DE02120300000000202051',
  amount: 320,
  subject: 'RG-2026-0042',
};

/** Mounts and clicks the trigger, then waits for the code to be encoded. */
async function openPopover(overrides: Partial<typeof props> = {}) {
  const wrapper = mount(PaymentQrPopover, {
    props: { ...props, ...overrides },
    attachTo: document.body,
  });
  await wrapper.find('button').trigger('click');
  // The QR is built asynchronously on first open.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  return wrapper;
}

describe('PaymentQrPopover', () => {
  it('renders the code as an image that describes itself', async () => {
    const wrapper = await openPopover();

    const image = wrapper.find('img');
    expect(image.attributes('src')).toMatch(/^data:image\/svg\+xml/);
    // formatMoney() separates with a non-breaking space.
    expect(image.attributes('alt')?.replace(/\u00a0/g, ' ')).toBe(
      'GiroCode für eine Überweisung von 320,00 € an Beispiel Inkasso GmbH',
    );
    wrapper.unmount();
  });

  it('explains itself instead of showing a broken code when the data does not fit', async () => {
    const wrapper = await openPopover({ amount: 0 });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(
      'Der Rechnungsbetrag lässt sich nicht als GiroCode darstellen',
    );
    wrapper.unmount();
  });

  it('encodes nothing before the popover is opened', () => {
    const wrapper = mount(PaymentQrPopover, { props, attachTo: document.body });
    expect(wrapper.find('img').exists()).toBe(false);
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await openPopover();

    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
