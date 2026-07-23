import { apiFetch } from '../lib/api';

export interface AdminUserDto {
  uuid: string;
  email: string;
  firstname: string;
  surname: string | null;
  status: number;
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

const unwrap = <T>(res: { data: T }): T => res.data;

export async function listUsers(): Promise<AdminUserDto[]> {
  return unwrap(await apiFetch<{ data: AdminUserDto[] }>('/users'));
}

export async function createUser(body: {
  email: string;
  firstname: string;
  surname?: string | null;
  password: string;
}): Promise<AdminUserDto> {
  return unwrap(await apiFetch<{ data: AdminUserDto }>('/users', { method: 'POST', body }));
}

export async function updateUser(uuid: string, body: Record<string, unknown>): Promise<AdminUserDto> {
  return unwrap(await apiFetch<{ data: AdminUserDto }>(`/users/${uuid}`, { method: 'PATCH', body }));
}

export async function deleteUser(uuid: string): Promise<void> {
  await apiFetch(`/users/${uuid}`, { method: 'DELETE' });
}

export async function setGlobalRoles(uuid: string, roleUIDs: string[]): Promise<AdminUserDto> {
  return unwrap(
    await apiFetch<{ data: AdminUserDto }>(`/users/${uuid}/global-roles`, {
      method: 'PUT',
      body: { roleUIDs },
    }),
  );
}

export async function setAccountRoles(
  uuid: string,
  grants: Array<{ accountUID: string; roleUID: string }>,
): Promise<AdminUserDto> {
  return unwrap(
    await apiFetch<{ data: AdminUserDto }>(`/users/${uuid}/account-roles`, {
      method: 'PUT',
      body: { grants },
    }),
  );
}

export async function listRoles(): Promise<RoleDto[]> {
  return unwrap(await apiFetch<{ data: RoleDto[] }>('/roles'));
}
