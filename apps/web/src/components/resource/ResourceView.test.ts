import { PERMISSIONS } from '@eunomia/shared';
import { faFilter } from '@fortawesome/free-solid-svg-icons';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withLocale } from '../../test/locale';

import { noPermission } from '../../lib/error-messages';
import type { ResourceConfig } from '../../resources/config';
import { grant } from '../../test/permissions';
import type { SelectOption } from './EuSelectField.vue';
import ResourceDetailDialog from './ResourceDetailDialog.vue';
import ResourceFormDialog from './ResourceFormDialog.vue';
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
  kind: 'facility',
  idKey: 'facilityUID',
  managePermission: 'MANAGE_FACILITIES',
  columns: [{ key: 'facilityName' }, { key: 'accountUID', lookup: 'accounts' }],
  fields: [{ key: 'facilityName', type: 'text', required: true }],
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

  /**
   * The other kind of row action (Scheibe 18): one that runs something instead
   * of leading somewhere — the account export fetches a document and hands it
   * to the browser. Its failure belongs in the view, because it belongs to no
   * dialog.
   */
  it('runs a row action that does something, and reports its failure', async () => {
    const run = vi.fn<(row: Record<string, unknown>) => Promise<void>>();
    const action = {
      icon: faFilter,
      label: (row: Record<string, unknown>) => `Daten von ${String(row.facilityName)} exportieren`,
      run,
    };
    run.mockResolvedValueOnce();
    const wrapper = await mountView({ ...config, rowActions: [action] });

    expect(wrapper.find('tbody tr a').exists()).toBe(false);
    const button = wrapper
      .findAll('tbody tr button')
      .find((one) => one.attributes('aria-label') === 'Daten von Praxis Nord exportieren');
    expect(button).toBeDefined();

    await button!.trigger('click');
    await flushPromises();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ facilityUID: 'f-1' }));
    expect(wrapper.find('.eu-resource__error').exists()).toBe(false);

    run.mockRejectedValueOnce(new Error('kaputt'));
    await button!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.eu-resource__error').exists()).toBe(true);
  });

  /**
   * A row action may need more than seeing the row does: the account export
   * hands out the person's invoices and billings and asks for all three read
   * permissions (B-3 of the review's second pass). Without them the button
   * stays where it is and says why, as every other action does since CR-26.
   */
  it('disables a row action whose permissions are missing, and says why', async () => {
    const run = vi.fn<(row: Record<string, unknown>) => Promise<void>>();
    const exportAction = {
      icon: faFilter,
      label: (row: Record<string, unknown>) => `Daten von ${String(row.facilityName)} exportieren`,
      permissions: [PERMISSIONS.VIEW_ACCOUNTS, PERMISSIONS.VIEW_INVOICES],
      run,
    };
    // One of the two, so the action is refused on the "all of them" rule and
    // not merely on holding nothing at all.
    grant({ global: [PERMISSIONS.VIEW_ACCOUNTS, PERMISSIONS.MANAGE_FACILITIES] });
    const wrapper = await mountView({ ...config, rowActions: [exportAction] });

    const button = wrapper
      .findAll('tbody tr button')
      .find((one) => one.attributes('aria-label') === 'Daten von Praxis Nord exportieren');
    expect(button).toBeDefined();
    expect(button!.attributes('disabled')).toBeDefined();
    expect(button!.attributes('title')).toBe(noPermission());

    grant({ global: [PERMISSIONS.VIEW_ACCOUNTS, PERMISSIONS.VIEW_INVOICES] });
    await flushPromises();
    const allowed = wrapper
      .findAll('tbody tr button')
      .find((one) => one.attributes('aria-label') === 'Daten von Praxis Nord exportieren');
    expect(allowed!.attributes('disabled')).toBeUndefined();
    expect(allowed!.attributes('title')).toBe('Daten von Praxis Nord exportieren');
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

/**
 * What the list offers a user who may not write it (CR-26). The permissions
 * come from the auth store, which every test starts with full (see
 * src/test/setup.ts), so each case here says what the user actually holds.
 */
describe('ResourceView permissions', () => {
  /** A policy-like list: account-scoped rows and an account picker in the form. */
  const scopedConfig: ResourceConfig = {
    path: '/contracts',
    kind: 'contract',
    idKey: 'contractUID',
    managePermission: 'MANAGE_CONTRACTS',
    accountKey: 'accountUID',
    columns: [{ key: 'contractNumber' }],
    fields: [
      { key: 'contractNumber', type: 'text', required: true },
      {
        key: 'accountUID',
        type: 'select',
        optionsFrom: 'accounts',
        scopedBy: 'MANAGE_CONTRACTS',
      },
    ],
    lookups: {
      accounts: {
        path: '/accounts',
        idKey: 'accountUID',
        label: (row) => String(row.firstname),
      },
    },
  };

  const contracts = [
    { contractUID: 'c-1', contractNumber: 'V-1', accountUID: 'a-1' },
    { contractUID: 'c-2', contractNumber: 'V-2', accountUID: 'a-2' },
  ];
  const twoAccounts = [
    { accountUID: 'a-1', firstname: 'Anna', surname: 'Muster' },
    { accountUID: 'a-2', firstname: 'Bodo', surname: 'Muster' },
  ];

  /** The row's action buttons, in template order: edit, delete. */
  const actionsOf = (wrapper: Awaited<ReturnType<typeof mountView>>, index: number) =>
    wrapper.findAll('tbody tr')[index].findAll('.eu-resource__actions button');

  beforeEach(() => {
    vi.clearAllMocks();
    listResource.mockImplementation((path: string) =>
      Promise.resolve(path === '/accounts' ? twoAccounts : contracts),
    );
  });

  it('disables creating without the permission, and says why', async () => {
    grant({ global: [], perAccount: [] });
    const wrapper = await mountView(scopedConfig);

    const create = wrapper.findAll('button').find((b) => b.text() === 'Neu');
    expect(create?.attributes('disabled')).toBeDefined();
    expect(create?.attributes('title')).toBe('Dazu fehlt dir die Berechtigung.');
  });

  it('allows creating on an account-scoped grant alone', async () => {
    grant({ perAccount: [{ accountUID: 'a-1', permissionKey: 'MANAGE_CONTRACTS' }] });
    const wrapper = await mountView(scopedConfig);

    const create = wrapper.findAll('button').find((b) => b.text() === 'Neu');
    expect(create?.attributes('disabled')).toBeUndefined();
  });

  it('asks for a global grant where creating has no account to scope to', async () => {
    // A new insured person is nobody's yet, so the API's POST /accounts wants
    // the permission globally — a grant for one account does not cover it.
    grant({ perAccount: [{ accountUID: 'a-1', permissionKey: 'MANAGE_CONTRACTS' }] });
    const wrapper = await mountView({ ...scopedConfig, createNeedsGlobal: true });

    const create = wrapper.findAll('button').find((b) => b.text() === 'Neu');
    expect(create?.attributes('disabled')).toBeDefined();
  });

  it('binds each row to its own account', async () => {
    grant({ perAccount: [{ accountUID: 'a-1', permissionKey: 'MANAGE_CONTRACTS' }] });
    const wrapper = await mountView(scopedConfig);

    const [, deleteOwn] = actionsOf(wrapper, 0);
    const [, deleteOther] = actionsOf(wrapper, 1);
    expect(deleteOwn.attributes('disabled')).toBeUndefined();
    expect(deleteOther.attributes('disabled')).toBeDefined();
    expect(deleteOther.attributes('title')).toBe('Dazu fehlt dir die Berechtigung.');
  });

  it('leads to the record even when it may only be read', async () => {
    grant({ global: [], perAccount: [] });
    const wrapper = await mountView(scopedConfig);

    // The mask stays the way to read the details, so the first action is open
    // and says so — "ansehen" instead of "bearbeiten".
    const [open] = actionsOf(wrapper, 0);
    expect(open.attributes('disabled')).toBeUndefined();
    expect(open.attributes('aria-label')).toBe('Police ansehen');

    await open.trigger('click');
    const mask = wrapper.findComponent(ResourceDetailDialog);
    expect(mask.props('readonly')).toBe(true);
    expect(mask.text()).not.toContain('Speichern');
  });

  it('offers only the accounts the new record may be created for', async () => {
    grant({ perAccount: [{ accountUID: 'a-1', permissionKey: 'MANAGE_CONTRACTS' }] });
    const wrapper = await mountView(scopedConfig);

    const offered = wrapper.findComponent(ResourceFormDialog).props('options').accounts;
    expect(offered.map((option: SelectOption) => option.value)).toEqual(['a-1']);
  });
});

describe('ResourceView in English', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResource.mockImplementation((path: string) =>
      Promise.resolve(path === '/accounts' ? accounts : []),
    );
  });

  it('names the kind and the columns from the catalogue', async () => {
    await withLocale('en', async () => {
      const wrapper = await mountView();
      expect(wrapper.text()).toContain('No providers recorded yet.');
      expect(wrapper.find('button').text()).toContain('New');
    });
  });
});
