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
    key: 'invoice',
    singular: 'Rechnung',
    plural: 'Rechnungen',
    entries: [
      {
        uid: 'iINVOICE0001',
        label: 'R-2026-1',
        context: 'Anna Muster, 120,00 €, 01.05.2026',
        deletedAt: '2026-09-26T09:15:00',
        restorable: true,
        restoreNote: null,
        attached: [],
        attachedRows: [{ label: 'Rechnung in einer Einreichung', count: 1 }],
        restoresWith: 0,
      },
    ],
  },
  {
    key: 'submission',
    singular: 'Einreichung',
    plural: 'Einreichungen',
    entries: [
      {
        uid: 'eSUBMISSI001',
        label: 'vom 01.10.2026',
        context: 'Police PKV-1',
        deletedAt: null,
        restorable: false,
        restoreNote: 'Eine Einreichung ohne Rechnungen kann nicht wiederhergestellt werden.',
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
