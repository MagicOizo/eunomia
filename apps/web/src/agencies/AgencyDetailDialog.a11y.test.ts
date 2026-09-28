import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgencyDetailDialog from './AgencyDetailDialog.vue';
import type { AgencyDto } from './api';

/** As the API hands it out: accounts in the order they were recorded. */
const agency: AgencyDto = {
  agencyUID: 'c-1',
  agencyName: 'Beispiel Inkasso GmbH',
  bankAccount: 'DE02120300000000202051',
  bic: null,
  recipientName: null,
  accounts: [
    {
      agencyAccountUID: 'g-1',
      bankAccount: 'DE02120300000000202051',
      bic: null,
      recipientName: null,
      note: null,
    },
    {
      agencyAccountUID: 'g-2',
      bankAccount: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      recipientName: 'Zahlstelle Beispiel Inkasso',
      note: 'für Rechnungen der Radiologie',
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
  it('shows every account, in the order they were recorded', async () => {
    const wrapper = await openDialog();

    expect(rows(wrapper)).toHaveLength(2);
    expect(rows(wrapper)[0]).toContain('DE02120300000000202051');
    expect(rows(wrapper)[1]).toContain('DE89370400440532013000');
    expect(rows(wrapper)[1]).toContain('Zahlstelle Beispiel Inkasso');

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

    expect(rows(wrapper)[1]).toContain('für Rechnungen der Radiologie');
    expect(wrapper.find('.eu-agency__note .eu-icon-label__text').text()).toBe(
      'für Rechnungen der Radiologie',
    );

    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await openDialog();

    const results = await axe.run(wrapper.element as HTMLElement);
    expect(results.violations).toEqual([]);

    wrapper.unmount();
  });
});
