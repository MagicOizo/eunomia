import { apiFetch } from './api';

/**
 * Thin CRUD helpers over the authenticated API client. Every master-data
 * endpoint shares the same shape — list/read return `{ data }`, delete returns
 * 204 — so the resource views can stay entirely config-driven.
 */

export type ResourceRow = Record<string, unknown>;

export async function listResource<T = ResourceRow>(path: string): Promise<T[]> {
  const res = await apiFetch<{ data: T[] }>(path);
  return res.data;
}

export async function createResource<T = ResourceRow>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch<{ data: T }>(path, { method: 'POST', body });
  return res.data;
}

export async function updateResource<T = ResourceRow>(
  path: string,
  id: string,
  body: unknown,
): Promise<T> {
  const res = await apiFetch<{ data: T }>(`${path}/${id}`, { method: 'PATCH', body });
  return res.data;
}

export async function deleteResource(path: string, id: string): Promise<void> {
  await apiFetch(`${path}/${id}`, { method: 'DELETE' });
}
