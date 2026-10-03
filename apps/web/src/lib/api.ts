import { useAuthStore } from '../stores/auth';
import { HttpError, type RequestOptions, request } from './http';

/**
 * Authenticated API client (the successor to the first attempt's `sendRequest`,
 * see eunomia-description.md §8). It attaches the in-memory access token and,
 * on a 401, transparently attempts a single refresh and retries the request
 * once. If the refresh fails the auth store is cleared and the original error
 * propagates, so a route guard can send the user back to the login page.
 *
 * Two requests that start together and both run into an expired token share one
 * refresh: the store hands the second caller the exchange the first one started
 * (see `tryRefresh`). A request whose 401 arrives after a sibling has already
 * renewed the token needs no refresh at all — it simply repeats itself with the
 * token the store holds now.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = useAuthStore();
  const token = auth.accessToken;
  try {
    return await request<T>(path, { ...options, token });
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    if (auth.accessToken !== token || (await auth.tryRefresh())) {
      return request<T>(path, { ...options, token: auth.accessToken });
    }
    throw error;
  }
}

/**
 * The same request with the success envelope taken off. Every record and list
 * endpoint carries its payload under `data` (apps/api/src/crud/envelope.ts), so
 * the caller states the payload type and receives the payload.
 *
 * `apiFetch` stays for the three routes that deliberately answer without an
 * envelope — `GET /version`, `/auth/*` and `/me` — and for the endpoints that
 * answer 204 with no body at all.
 */
export async function apiData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch<{ data: T }>(path, options);
  return res.data;
}
