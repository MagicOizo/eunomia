import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgencyDetailDialog from './AgencyDetailDialog.vue';
import type { AgencyDto } from './api';

/** As the API hands it out: accounts oldest first, the undated one in front. */
const agency: AgencyDto = {
  agencyUID: 'c-1',
  agencyName: 'Beispiel Inkasso GmbH',
  bankAccount: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  recipientName: 'Zahlstelle Beispiel Inkasso',
  accounts: [
    {
      agencyAccountUID: 'g-1',
      validFrom: null,
      validTo: '2025-12-31',
      bankAccount: 'DE02120300000000202051',
      bic: null,
      recipientName: null,
      note: null,
    },
    {
      agencyAccountUID: 'g-2',
      validFrom: '2026-01-01',
      validTo: null,
      bankAccount: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      recipientName: 'Zahlstelle Beispiel Inkasso',
      note: 'Bankwechsel zum Jahreswechsel',
    },
  ],
};

const { getAgency } = vi.hoisted(() => ({ getAgency: vi.fn() }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getAgency,
}));

beforeEach(() => {
  getAgency.mockReset();
  getAgency.mockImplementation(async () => structuredClone(agency));
});

async function openDialog() {
  const wrapper = mount(AgencyDetailDialog, {
    props: { open: true, uid: 'c-1', options: {} },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const rows = (wrapper: Awaited<ReturnType<typeof openDialog>>): string[] =>
  wrapper.findAll('tbody tr').map((row) => row.text());

describe('AgencyDetailDialog', () => {
  it('shows the account in force, newest first, and folds the older one away', async () => {
    const wrapper = await openDialog();

    // One data row plus the disclosure row.
    expect(rows(wrapper)).toHaveLength(2);
    expect(rows(wrapper)[0]).toContain('ab 01.01.2026');
    expect(rows(wrapper)[0]).toContain('DE89370400440532013000');
    expect(wrapper.find('.eu-agency__more button').text()).toBe('1 älteren Eintrag anzeigen');

    await wrapper.find('.eu-agency__more button').trigger('click');
    expect(rows(wrapper)).toHaveLength(3);
    // The undated entry names no start, only when it ended.
    expect(rows(wrapper)[1]).toContain('bis 31.12.2025');
    expect(wrapper.find('.eu-agency__more button').text()).toBe('Ältere Einträge ausblenden');

    wrapper.unmount();
  });

  it('leaves a single account without a disclosure row', async () => {
    getAgency.mockResolvedValueOnce({
      ...structuredClone(agency),
      accounts: [{ ...structuredClone(agency).accounts[0], validTo: null }],
    });
    const wrapper = await openDialog();

    expect(rows(wrapper)).toHaveLength(1);
    expect(rows(wrapper)[0]).toContain('immer gültig');
    expect(wrapper.find('.eu-agency__more button').exists()).toBe(false);

    wrapper.unmount();
  });

  it('says so when no account is recorded at all', async () => {
    getAgency.mockResolvedValueOnce({ ...structuredClone(agency), accounts: [] });
    const wrapper = await openDialog();

    expect(wrapper.find('.eu-agency__hint').text()).toBe('Noch keine Kontoverbindung erfasst.');

    wrapper.unmount();
  });

  it('puts a note behind a bubble that carries the text as its accessible name', async () => {
    const wrapper = await openDialog();

    expect(wrapper.findAll('th').map((th) => th.text())).not.toContain('Notiz');
    expect(rows(wrapper)[0]).toContain('Bankwechsel zum Jahreswechsel');

    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await openDialog();

    const results = await axe.run(wrapper.element as HTMLElement);
    expect(results.violations).toEqual([]);

    wrapper.unmount();
  });
});
