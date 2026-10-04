import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('./api', () => ({
  listUsers: (includeDeleted?: boolean): Promise<AdminUserDto[]> => listUsers(includeDeleted),
  listRoles: (): Promise<RoleDto[]> => listRoles(),
  restoreUser: (uuid: string): Promise<AdminUserDto> => restoreUser(uuid),
  purgeUser: (uuid: string): Promise<void> => purgeUser(uuid),
  deleteUser: (uuid: string): Promise<void> => deleteUser(uuid),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setGlobalRoles: vi.fn(),
  setAccountRoles: vi.fn(),
}));

vi.mock('../lib/resource', () => ({ listResource: (): Promise<unknown[]> => Promise.resolve([]) }));

const { default: UsersView } = await import('./UsersView.vue');

function user(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    uuid: '11111111-1111-1111-1111-111111111111',
    email: 'aktiv@example.com',
    firstname: 'Ada',
    surname: 'Lovelace',
    status: 1,
    deletedAt: null,
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
});
