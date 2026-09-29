import { faFilter } from '@fortawesome/free-solid-svg-icons';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResourceConfig } from '../../resources/config';
import ResourceView from './ResourceView.vue';

const { listResource } = vi.hoisted(() => ({ listResource: vi.fn() }));

vi.mock('../../lib/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/resource')>()),
  listResource,
}));

const facilities = [
  { facilityUID: 'f-1', facilityName: 'Praxis Nord', accountUID: 'a-1' },
  { facilityUID: 'f-2', facilityName: 'Zahnarzt Süd', accountUID: 'a-1' },
];

const accounts = [{ accountUID: 'a-1', firstname: 'Anna', surname: 'Muster' }];

/** A list with a plain column and a looked-up one, like the policy list has. */
const config: ResourceConfig = {
  path: '/facilities',
  singular: 'Leistungserbringer',
  plural: 'Leistungserbringer',
  idKey: 'facilityUID',
  columns: [
    { key: 'facilityName', label: 'Name' },
    { key: 'accountUID', label: 'Versicherter', lookup: 'accounts' },
  ],
  fields: [{ key: 'facilityName', label: 'Name', type: 'text', required: true }],
  lookups: {
    accounts: {
      path: '/accounts',
      idKey: 'accountUID',
      label: (row) => `${String(row.firstname)} ${String(row.surname)}`,
    },
  },
};

async function mountView(resourceConfig: ResourceConfig = config) {
  const wrapper = mount(ResourceView, {
    props: { config: resourceConfig },
    // Renders a row action as href, so its target can be read off the DOM.
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  });
  await flushPromises();
  return wrapper;
}

const rowTexts = (wrapper: Awaited<ReturnType<typeof mountView>>): string[] =>
  wrapper.findAll('tbody tr').map((row) => row.text());

describe('ResourceView search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResource.mockImplementation((path: string) =>
      Promise.resolve(path === '/accounts' ? accounts : facilities),
    );
  });

  it('keeps only the rows whose cells contain the search text', async () => {
    const wrapper = await mountView();
    expect(rowTexts(wrapper)).toHaveLength(2);

    await wrapper.find('.eu-resource__search input').setValue('zahn');
    const rows = rowTexts(wrapper);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Zahnarzt Süd');
  });

  it('searches the resolved name of a lookup column, not its UID', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-resource__search input').setValue('Muster');
    expect(rowTexts(wrapper)).toHaveLength(2);

    await wrapper.find('.eu-resource__search input').setValue('a-1');
    expect(rowTexts(wrapper)).toHaveLength(0);
  });

  it('says that the search found nothing, not that the list is empty', async () => {
    const wrapper = await mountView();

    await wrapper.find('.eu-resource__search input').setValue('gibt es nicht');
    expect(wrapper.text()).toContain('Kein Eintrag passt zu dieser Suche.');
    expect(wrapper.text()).not.toContain('Noch keine Leistungserbringer erfasst.');
  });

  it('offers no search field while the list is empty', async () => {
    listResource.mockImplementation((path: string) =>
      Promise.resolve(path === '/accounts' ? accounts : []),
    );
    const wrapper = await mountView();

    expect(wrapper.find('.eu-resource__search').exists()).toBe(false);
    expect(wrapper.text()).toContain('Noch keine Leistungserbringer erfasst.');
  });

  it('renders a row action as a link to its target', async () => {
    const wrapper = await mountView({
      ...config,
      rowActions: [
        {
          icon: faFilter,
          label: (row) => `Rechnungen von ${String(row.facilityName)} anzeigen`,
          to: (row) => `/invoices?facility=${String(row.facilityUID)}`,
        },
      ],
    });

    const link = wrapper.find('tbody tr a');
    expect(link.attributes('href')).toBe('/invoices?facility=f-1');
    expect(link.attributes('aria-label')).toBe('Rechnungen von Praxis Nord anzeigen');
  });
});
