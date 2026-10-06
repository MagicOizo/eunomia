import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { withLocale } from '../test/locale';
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

/** A billing with the reimbursement that was deleted with it, and one invoice. */
function groups(): TrashGroupDto[] {
  return [
    {
      kind: 'serviceBilling',
      entries: [
        {
          uid: 'sBILLING0001',
          label: { type: 'text', value: 'LA-1' },
          context: [
            { type: 'policy', number: 'PKV-1' },
            { type: 'dated', date: '2024-07-01' },
          ],
          deletedAt: '2026-09-26T09:15:00',
          restorable: true,
          attached: [{ kind: 'allocation', label: { type: 'money', value: 50 } }],
          attachedRows: [],
          restoresWith: 1,
        },
      ],
    },
    {
      kind: 'submission',
      entries: [
        {
          uid: 'eSUBMISSI001',
          label: { type: 'dated', date: '2024-10-01' },
          context: [{ type: 'policy', number: 'PKV-1' }],
          deletedAt: null,
          restorable: false,
          attached: [],
          attachedRows: [{ kind: 'submissionInvoice', count: 2 }],
          restoresWith: 0,
        },
      ],
    },
  ];
}

async function mountView() {
  const wrapper = mount(TrashView);
  await flushPromises();
  return wrapper;
}

describe('TrashView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTrash.mockResolvedValue(groups());
    restoreEntry.mockResolvedValue(2);
    purgeEntry.mockResolvedValue(undefined);
  });

  it('lists each kind with what hangs on it and when it went', async () => {
    const wrapper = await mountView();
    const text = wrapper.text();
    expect(text).toContain('Leistungsabrechnungen (1)');
    expect(text).toContain('LA-1');
    expect(text).toContain('Police PKV-1, vom 01.07.2024');
    expect(text).toContain('samt 1 Erstattung');
    expect(text).toContain('26.09.2026, 09:15');
    // A row deleted before this version has no moment to show.
    expect(text).toContain('unbekannt');
    expect(text).toContain('samt 2 Rechnungen in Einreichungen');
  });

  it('offers no restore where the API says there is none, and gives the reason', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('kann nicht wiederhergestellt werden');
    const restoreButtons = wrapper
      .findAll('button')
      .filter((button) => button.attributes('aria-label')?.includes('wiederherstellen'));
    expect(restoreButtons).toHaveLength(1);
    expect(restoreButtons[0]?.attributes('aria-label')).toBe(
      'Leistungsabrechnung wiederherstellen',
    );
    // The tooltip says what a restore covers — not the same as what a final
    // delete would take along.
    expect(restoreButtons[0]?.attributes('title')).toBe(
      'Leistungsabrechnung wiederherstellen (samt 1 Eintrag)',
    );
  });

  it('restores a record and reloads the list', async () => {
    const wrapper = await mountView();
    const restore = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('wiederherstellen'));
    await restore?.trigger('click');
    await flushPromises();
    expect(restoreEntry).toHaveBeenCalledWith('sBILLING0001');
    expect(loadTrash).toHaveBeenCalledTimes(2);
  });

  it('shows the failure at the row and leaves the list as it was', async () => {
    restoreEntry.mockRejectedValue(
      new HttpError(409, 'PARENT_IN_TRASH', 'parent in trash', {
        entry: { kind: 'serviceBilling', label: { type: 'text', value: 'LA-1' } },
        parent: { kind: 'contract', label: { type: 'text', value: 'PKV-1' } },
      }),
    );
    const wrapper = await mountView();
    const restore = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('wiederherstellen'));
    await restore?.trigger('click');
    await flushPromises();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Police „PKV-1“ liegt ebenfalls im Papierkorb');
    expect(alert.text()).toContain('Es wurde nichts wiederhergestellt.');
    expect(loadTrash).toHaveBeenCalledTimes(1);
  });

  it('asks before deleting for good and names what goes along', async () => {
    const wrapper = await mountView();
    const purge = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('endgültig löschen'));
    await purge?.trigger('click');
    await flushPromises();

    const dialog = wrapper.find('dialog');
    expect(dialog.attributes('open')).toBeDefined();
    expect(dialog.text()).toContain('Leistungsabrechnung „LA-1“ endgültig löschen?');
    // The amount comes from Intl, with a non-breaking space before the sign.
    expect(dialog.text()).toMatch(/Mit gelöscht wird: Erstattung 50,00\s€\./);
    expect(purgeEntry).not.toHaveBeenCalled();

    const confirm = dialog
      .findAll('button')
      .find((button) => button.text() === 'Endgültig löschen');
    await confirm?.trigger('click');
    await flushPromises();
    expect(purgeEntry).toHaveBeenCalledWith('sBILLING0001');
    expect(loadTrash).toHaveBeenCalledTimes(2);
  });

  it('narrows the list to what the search matches', async () => {
    const wrapper = await mountView();
    const search = wrapper.find('input');
    await search.setValue('LA-1');
    expect(wrapper.text()).toContain('Leistungsabrechnungen (1)');
    expect(wrapper.text()).not.toContain('Einreichungen (1)');

    await search.setValue('gibtesnicht');
    expect(wrapper.text()).toContain('Kein Eintrag passt zu dieser Suche.');
  });

  it('says so when nothing is deleted', async () => {
    loadTrash.mockResolvedValue([]);
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Der Papierkorb ist leer.');
  });

  it('speaks English, with the kinds, parts and plurals from the catalogue', async () => {
    await withLocale('en', async () => {
      const wrapper = await mountView();
      const text = wrapper.text();
      expect(text).toContain('Service billings (1)');
      expect(text).toContain('Policy PKV-1, dated 01/07/2024');
      expect(text).toContain('with 1 reimbursement');
      // The deleted kind stays a name of its own, without a sentence around it.
      expect(text).toContain('Deleted on');
      expect(text).toContain('with 2 invoices in submissions');
      expect(text).toContain('A submission without invoices cannot be restored.');
      const restore = wrapper
        .findAll('button')
        .find((button) => button.attributes('aria-label') === 'Restore service billing');
      expect(restore?.attributes('title')).toBe('Restore service billing (with 1 more entry)');
    });
  });
});
