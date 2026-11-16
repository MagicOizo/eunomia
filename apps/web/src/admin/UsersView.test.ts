import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withLocale } from '../test/locale';

import type { AdminUserDto, RoleDto } from './api';

/**
 * The deleted users in the administration (Scheibe 18, SEC-15). Until now a
 * deleted user was invisible: the row kept name and address and no mask could
 * reach it. What this file pins down is the mask that brings it back or removes
 * it for good — and that the final delete asks first.
 */

const listUsers = vi.fn<(includeDeleted?: boolean) => Promise<AdminUserDto[]>>();
const listRoles = vi.fn<() => Promise<RoleDto[]>>();
const restoreUser = vi.fn<(uuid: string) => Promise<AdminUserDto>>();
const purgeUser = vi.fn<(uuid: string) => Promise<void>>();
const deleteUser = vi.fn<(uuid: string) => Promise<void>>();
const unlinkOidc = vi.fn<(uuid: string) => Promise<AdminUserDto>>();
const createUser = vi.fn<(body: Record<string, unknown>) => Promise<AdminUserDto>>();
const loadLoginOptions = vi.fn<() => Promise<{ password: boolean; oidc: null }>>();

vi.mock('./api', () => ({
  listUsers: (includeDeleted?: boolean): Promise<AdminUserDto[]> => listUsers(includeDeleted),
  listRoles: (): Promise<RoleDto[]> => listRoles(),
  restoreUser: (uuid: string): Promise<AdminUserDto> => restoreUser(uuid),
  purgeUser: (uuid: string): Promise<void> => purgeUser(uuid),
  deleteUser: (uuid: string): Promise<void> => deleteUser(uuid),
  unlinkOidc: (uuid: string): Promise<AdminUserDto> => unlinkOidc(uuid),
  createUser: (body: Record<string, unknown>): Promise<AdminUserDto> => createUser(body),
  updateUser: vi.fn(),
  setGlobalRoles: vi.fn(() => Promise.resolve()),
  setAccountRoles: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/login-options', () => ({
  loadLoginOptions: (): Promise<{ password: boolean; oidc: null }> => loadLoginOptions(),
}));

vi.mock('../lib/resource', () => ({ listResource: (): Promise<unknown[]> => Promise.resolve([]) }));

const { default: UsersView } = await import('./UsersView.vue');
const { useAuthStore } = await import('../stores/auth');

function user(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    uuid: '11111111-1111-1111-1111-111111111111',
    email: 'aktiv@example.com',
    firstname: 'Ada',
    surname: 'Lovelace',
    status: 1,
    deletedAt: null,
    oidcLinked: false,
    globalRoles: ['Admin'],
    accountGrants: [],
    ...overrides,
  };
}

const deletedUser = user({
  uuid: '22222222-2222-2222-2222-222222222222',
  email: 'weg@example.com',
  firstname: 'Gelöschte',
  surname: 'Person',
  status: -1,
  deletedAt: '2026-07-01T09:15:00',
  globalRoles: [],
});

async function mountView() {
  const wrapper = mount(UsersView);
  await flushPromises();
  return wrapper;
}

const button = (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) =>
  wrapper.findAll('button').find((one) => (one.attributes('aria-label') ?? '') === label);

describe('UsersView: deleted users', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    loadLoginOptions.mockResolvedValue({ password: true, oidc: null });
    listRoles.mockResolvedValue([]);
    listUsers.mockResolvedValue([user(), deletedUser]);
    restoreUser.mockResolvedValue(user({ ...deletedUser, status: 0, deletedAt: null }));
    purgeUser.mockResolvedValue();
  });

  it('asks for the deleted users and keeps them out of the active table', async () => {
    const wrapper = await mountView();
    expect(listUsers).toHaveBeenCalledWith(true);

    const rows = wrapper.findAll('tbody')[0]?.findAll('tr') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('aktiv@example.com');

    expect(wrapper.text()).toContain('Gelöschte Nutzer (1)');
    expect(wrapper.text()).toContain('weg@example.com');
    expect(wrapper.text()).toContain('01.07.2026');
  });

  it('says that a restored user comes back deactivated', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('kommt er deaktiviert zurück');
  });

  it('restores on one click and reloads', async () => {
    const wrapper = await mountView();
    await button(wrapper, 'Wiederherstellen')!.trigger('click');
    await flushPromises();

    expect(restoreUser).toHaveBeenCalledWith(deletedUser.uuid);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('asks before removing a user for good, and names what goes with them', async () => {
    const wrapper = await mountView();
    await button(wrapper, 'Endgültig löschen')!.trigger('click');
    await flushPromises();

    expect(purgeUser).not.toHaveBeenCalled();
    const dialog = wrapper.text();
    expect(dialog).toContain('endgültig löschen');
    expect(dialog).toContain('Sitzungen');
    expect(dialog).toContain('nicht rückgängig');

    const confirm = wrapper
      .findAll('button')
      .find(
        (one) => one.text() === 'Endgültig löschen' && one.attributes('aria-label') === undefined,
      );
    await confirm!.trigger('click');
    await flushPromises();
    expect(purgeUser).toHaveBeenCalledWith(deletedUser.uuid);
  });

  it('a failed restore stays in the row it happened in', async () => {
    restoreUser.mockRejectedValueOnce(new Error('kaputt'));
    const wrapper = await mountView();
    await button(wrapper, 'Wiederherstellen')!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it('a deletion nobody dated says so instead of inventing a moment', async () => {
    listUsers.mockResolvedValue([user(), { ...deletedUser, deletedAt: null }]);
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('unbekannt');
  });

  it('shows no section at all while nothing is deleted', async () => {
    listUsers.mockResolvedValue([user()]);
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain('Gelöschte Nutzer');
  });

  it('names the system roles and the sections in English', async () => {
    await withLocale('en', async () => {
      listUsers.mockResolvedValue([user({ globalRoles: ['Nutzer'] }), deletedUser]);
      listRoles.mockResolvedValue([
        {
          roleUID: 'r-1',
          roleName: 'Nutzer',
          description: 'Standard user: work with invoices for assigned accounts',
          isSystem: true,
          permissions: ['VIEW_INVOICES'],
        },
      ]);
      const wrapper = await mountView();
      const text = wrapper.text();
      expect(text).toContain('Deleted users (1)');
      // The seeded German name is a key, not what the table shows.
      expect(wrapper.find('tbody').text()).toContain('User');
      expect(text).toContain('Works with the invoices of the assigned accounts');
      const badge = wrapper.find('.eu-roles__perms span');
      expect(badge.text()).toBe('View invoices and service billings');
      expect(badge.attributes('title')).toBe('VIEW_INVOICES');
    });
  });
});

/**
 * The link to the sign-in provider (Slice 91): a flag in the list, a row
 * action that asks first, and one's own link held while the password login is
 * closed (blueprint, finding 6).
 */
describe('UsersView: link to the sign-in provider', () => {
  const me = user({ uuid: '33333333-3333-3333-3333-333333333333', email: 'ich@example.com' });
  const linked = user({ email: 'verknuepft@example.com', oidcLinked: true });

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    useAuthStore().user = { uuid: me.uuid } as never;
    listRoles.mockResolvedValue([]);
    loadLoginOptions.mockResolvedValue({ password: true, oidc: null });
    unlinkOidc.mockResolvedValue({ ...linked, oidcLinked: false });
  });

  const rowOf = (wrapper: Awaited<ReturnType<typeof mountView>>, email: string) =>
    wrapper
      .findAll('tbody')[0]!
      .findAll('tr')
      .find((row) => row.text().includes(email))!;

  it('flags linked accounts and offers the action only there', async () => {
    listUsers.mockResolvedValue([linked, me]);
    const wrapper = await mountView();

    const linkedRow = rowOf(wrapper, 'verknuepft@example.com');
    expect(linkedRow.text()).toContain('Verknüpft');
    expect(linkedRow.find('[aria-label="Verknüpfung lösen"]').exists()).toBe(true);

    const plainRow = rowOf(wrapper, 'ich@example.com');
    expect(plainRow.text()).not.toContain('Verknüpft');
    expect(plainRow.find('[aria-label="Verknüpfung lösen"]').exists()).toBe(false);
  });

  it('asks first, then undoes the link and reloads', async () => {
    listUsers.mockResolvedValue([linked, me]);
    const wrapper = await mountView();
    await button(wrapper, 'Verknüpfung lösen')!.trigger('click');
    await flushPromises();

    expect(unlinkOidc).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('wieder über seine E-Mail-Adresse zugeordnet');

    const confirm = wrapper
      .findAll('button')
      .find(
        (one) => one.text() === 'Verknüpfung lösen' && one.attributes('aria-label') === undefined,
      );
    await confirm!.trigger('click');
    await flushPromises();
    expect(unlinkOidc).toHaveBeenCalledWith(linked.uuid);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('holds one’s own link while the password login is closed, and says why', async () => {
    loadLoginOptions.mockResolvedValue({ password: false, oidc: null });
    listUsers.mockResolvedValue([{ ...me, oidcLinked: true }]);
    const wrapper = await mountView();
    await button(wrapper, 'Verknüpfung lösen')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('solange die Anmeldung mit Passwort ausgeschaltet ist');
    const confirm = wrapper
      .findAll('button')
      .find(
        (one) => one.text() === 'Verknüpfung lösen' && one.attributes('aria-label') === undefined,
      );
    expect(confirm).toBeUndefined();
    expect(unlinkOidc).not.toHaveBeenCalled();
  });

  it('another account’s link stays repairable while the door is closed', async () => {
    loadLoginOptions.mockResolvedValue({ password: false, oidc: null });
    listUsers.mockResolvedValue([linked, me]);
    const wrapper = await mountView();
    await button(wrapper, 'Verknüpfung lösen')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('solange die Anmeldung mit Passwort ausgeschaltet ist');
    expect(wrapper.text()).toContain('wieder über seine E-Mail-Adresse zugeordnet');
  });
});

/**
 * A new user starts with a generated password, in the clear (Slice 91): the
 * administrator passes it on now — after saving it exists only as a hash.
 */
describe('UsersView: the password of a new user', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    listRoles.mockResolvedValue([]);
    listUsers.mockResolvedValue([user()]);
    loadLoginOptions.mockResolvedValue({ password: true, oidc: null });
    createUser.mockResolvedValue(user({ uuid: '44444444-4444-4444-4444-444444444444' }));
  });

  async function openCreate() {
    const wrapper = await mountView();
    const create = wrapper.findAll('button').find((one) => one.text() === 'Neuer Nutzer');
    await create!.trigger('click');
    await flushPromises();
    return wrapper;
  }

  const passwordInput = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
    wrapper.find('.eu-form__password input');

  it('comes generated, visible and noted as shown only now', async () => {
    const wrapper = await openCreate();
    const input = passwordInput(wrapper);
    expect(input.attributes('type')).toBe('text');
    expect((input.element as HTMLInputElement).value).toMatch(/^[^-]{4}(-[^-]{4}){3}$/);
    expect(wrapper.text()).toContain('nur jetzt zu sehen');
  });

  it('can be drawn again or overwritten, and is what gets sent', async () => {
    const wrapper = await openCreate();
    const first = (passwordInput(wrapper).element as HTMLInputElement).value;
    await button(wrapper, 'Neues Passwort erzeugen')!.trigger('click');
    expect((passwordInput(wrapper).element as HTMLInputElement).value).not.toBe(first);

    await passwordInput(wrapper).setValue('mein-eigenes-1');
    const fields = wrapper.findAll('.eu-form input');
    await fields[0]!.setValue('neu@example.com');
    await fields[1]!.setValue('Neu');
    const save = wrapper.findAll('button').find((one) => one.text() === 'Speichern');
    await save!.trigger('click');
    await flushPromises();

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'neu@example.com', password: 'mein-eigenes-1' }),
    );
  });

  it('copies the password, and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = await openCreate();
    const shown = (passwordInput(wrapper).element as HTMLInputElement).value;
    await button(wrapper, 'Passwort kopieren')!.trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(shown);
    expect(wrapper.text()).toContain('Passwort kopiert');
  });
});
