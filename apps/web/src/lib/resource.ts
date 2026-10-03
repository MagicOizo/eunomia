import { apiData, apiFetch } from './api';

/**
 * Thin CRUD helpers over the authenticated API client. Every master-data
 * endpoint shares the same shape — list/read answer with a payload, delete
 * answers 204 — so the resource views can stay entirely config-driven.
 */

export type ResourceRow = Record<string, unknown>;

export async function listResource<T = ResourceRow>(path: string): Promise<T[]> {
  return apiData<T[]>(path);
}

export async function createResource<T = ResourceRow>(path: string, body: unknown): Promise<T> {
  return apiData<T>(path, { method: 'POST', body });
}

export async function updateResource<T = ResourceRow>(
  path: string,
  id: string,
  body: unknown,
): Promise<T> {
  return apiData<T>(`${path}/${id}`, { method: 'PATCH', body });
}

export async function deleteResource(path: string, id: string): Promise<void> {
  await apiFetch(`${path}/${id}`, { method: 'DELETE' });
}
