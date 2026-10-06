import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrashGroupDto } from './api';

const { loadTrash, restoreEntry, purgeEntry } = vi.hoisted(() => ({
  loadTrash: vi.fn(),
  restoreEntry: vi.fn(),
  purgeEntry: vi.fn(),
}));

vi.mock('./api', () => ({
  loadTrash: (): Promise<TrashGroupDto[]> => loadTrash(),
  restoreEntry: (uid: string): Promise<number> => restoreEntry(uid),
  purgeEntry: (uid: string): Promise<void> => purgeEntry(uid),
}));

const { default: TrashView } = await import('./TrashView.vue');

const groups: TrashGroupDto[] = [
  {
    kind: 'invoice',
    entries: [
      {
        uid: 'iINVOICE0001',
        label: { type: 'text', value: 'R-2026-1' },
        context: [
          { type: 'text', value: 'Anna Muster' },
          { type: 'money', value: 120 },
          { type: 'date', value: '2026-05-01' },
        ],
        deletedAt: '2026-09-26T09:15:00',
        restorable: true,
        attached: [],
        attachedRows: [{ kind: 'submissionInvoice', count: 1 }],
        restoresWith: 0,
      },
    ],
  },
  {
    kind: 'submission',
    entries: [
      {
        uid: 'eSUBMISSI001',
        label: { type: 'dated', date: '2026-10-01' },
        context: [{ type: 'policy', number: 'PKV-1' }],
        deletedAt: null,
        restorable: false,
        attached: [],
        attachedRows: [],
        restoresWith: 0,
      },
    ],
  },
];

async function mountView() {
  const wrapper = mount(TrashView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe('TrashView accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTrash.mockResolvedValue(groups);
    restoreEntry.mockResolvedValue(1);
    purgeEntry.mockResolvedValue(undefined);
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await mountView();
    const options = {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    };

    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);

    // With the confirmation open: the dialog is part of the same tree.
    const purge = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('endgültig löschen'));
    await purge?.trigger('click');
    await flushPromises();
    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);

    // And collapsed, so a hidden region leaves no dangling reference.
    await wrapper.find('button[aria-expanded]').trigger('click');
    expect((await axe.run(wrapper.element, options)).violations).toEqual([]);
    wrapper.unmount();
  });

  it('names both actions per row for a screen reader', async () => {
    const wrapper = await mountView();
    const labels = wrapper
      .findAll('button')
      .map((button) => button.attributes('aria-label'))
      .filter((label): label is string => label !== undefined);
    expect(labels).toContain('Rechnung wiederherstellen');
    expect(labels).toContain('Rechnung endgültig löschen');
    expect(labels).toContain('Einreichung endgültig löschen');
    expect(labels).not.toContain('Einreichung wiederherstellen');
    wrapper.unmount();
  });
});
