import { apiData, apiFetch } from '../lib/api';

export interface AdminUserDto {
  uuid: string;
  email: string;
  firstname: string;
  surname: string | null;
  status: number;
  /** When the user was deleted — null unless `status` is -1 (SEC-15). */
  deletedAt: string | null;
  globalRoles: string[];
  accountGrants: Array<{ accountUID: string; roleName: string }>;
}

export interface RoleDto {
  roleUID: string;
  roleName: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

/**
 * The users. `includeDeleted` adds the deleted ones (`status === -1`), which
 * only the user administration asks for — everywhere else a deleted user is
 * gone.
 */
export async function listUsers(includeDeleted = false): Promise<AdminUserDto[]> {
  return apiData<AdminUserDto[]>(includeDeleted ? '/users?includeDeleted=true' : '/users');
}

export async function createUser(body: {
  email: string;
  firstname: string;
  surname?: string | null;
  password: string;
}): Promise<AdminUserDto> {
  return apiData<AdminUserDto>('/users', { method: 'POST', body });
}

export async function updateUser(
  uuid: string,
  body: Record<string, unknown>,
): Promise<AdminUserDto> {
  return apiData<AdminUserDto>(`/users/${uuid}`, { method: 'PATCH', body });
}

export async function deleteUser(uuid: string): Promise<void> {
  await apiFetch(`/users/${uuid}`, { method: 'DELETE' });
}

/** Brings a deleted user back — deactivated, not active (see the API). */
export async function restoreUser(uuid: string): Promise<AdminUserDto> {
  return apiData<AdminUserDto>(`/users/${uuid}/restore`, { method: 'POST' });
}

/** Removes a deleted user for good. Not undoable. */
export async function purgeUser(uuid: string): Promise<void> {
  await apiFetch(`/users/${uuid}/permanent`, { method: 'DELETE' });
}

export async function setGlobalRoles(uuid: string, roleUIDs: string[]): Promise<AdminUserDto> {
  return apiData<AdminUserDto>(`/users/${uuid}/global-roles`, {
    method: 'PUT',
    body: { roleUIDs },
  });
}

export async function setAccountRoles(
  uuid: string,
  grants: Array<{ accountUID: string; roleUID: string }>,
): Promise<AdminUserDto> {
  return apiData<AdminUserDto>(`/users/${uuid}/account-roles`, {
    method: 'PUT',
    body: { grants },
  });
}

export async function listRoles(): Promise<RoleDto[]> {
  return apiData<RoleDto[]>('/roles');
}
