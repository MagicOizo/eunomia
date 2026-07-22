import { useAuthStore } from '../stores/auth';
import { HttpError, type RequestOptions, request } from './http';

/**
 * Authenticated API client (the successor to the first attempt's `sendRequest`,
 * see eunomia-description.md §8). It attaches the in-memory access token and,
 * on a 401, transparently attempts a single refresh and retries the request
 * once. If the refresh fails the auth store is cleared and the original error
 * propagates, so a route guard can send the user back to the login page.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = useAuthStore();
  try {
    return await request<T>(path, { ...options, token: auth.accessToken });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401 && (await auth.tryRefresh())) {
      return request<T>(path, { ...options, token: auth.accessToken });
    }
    throw error;
  }
}
