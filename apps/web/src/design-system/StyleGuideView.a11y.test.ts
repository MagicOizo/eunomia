import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import StyleGuideView from './StyleGuideView.vue';

describe('StyleGuideView accessibility', () => {
  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = mount(StyleGuideView, { attachTo: document.body });

    const results = await axe.run(wrapper.element, {
      rules: {
        // jsdom has no layout/paint engine, so axe cannot evaluate rendered
        // colors reliably here. Contrast is verified analytically instead —
        // see CONTRAST.md for the full computed WCAG table.
        'color-contrast': { enabled: false },
      },
    });

    expect(results.violations).toEqual([]);

    wrapper.unmount();
  });
});
