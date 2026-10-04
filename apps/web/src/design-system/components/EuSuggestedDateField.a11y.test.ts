import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import EuSuggestedDateField from './EuSuggestedDateField.vue';

/**
 * The suggestion list is a named group of buttons with one Tab stop — a shape
 * axe has an opinion about, so it gets asked while the list stands open.
 */
describe('EuSuggestedDateField accessibility', () => {
  it('has no automatically detectable violations with its list open', async () => {
    const wrapper = mount(EuSuggestedDateField, {
      props: {
        modelValue: '2020-03-15',
        label: 'Zahlungsziel',
        suggestionsLabel: 'Typische Zahlungsziele',
        suggestions: [
          { value: '2020-03-01', label: 'sofort', hint: '01.03.2020' },
          { value: '2020-03-15', label: '14 Tage', hint: '15.03.2020' },
          { value: '2020-03-16', label: '15 Tage', hint: '16.03.2020' },
          { value: '2020-03-31', label: '30 Tage', hint: '31.03.2020' },
        ],
      },
      attachTo: document.body,
    });
    await wrapper.find('input').trigger('focusin');
    expect(wrapper.find('[role="group"]').exists()).toBe(true);

    const rules = {
      // jsdom cannot render colors; contrast is covered analytically
      // (design-system/CONTRAST.md).
      'color-contrast': { enabled: false },
    };
    expect((await axe.run(wrapper.element, { rules })).violations).toEqual([]);

    // Each entry says both the step and the date it works out to, so its name
    // stands on its own in a list of buttons read one after the other.
    const names = wrapper.findAll('.eu-date-suggest__option').map((b) => b.text());
    expect(names[1]).toContain('14 Tage');
    expect(names[1]).toContain('15.03.2020');

    wrapper.unmount();
  });
});
