/**
 * Low-level HTTP helper for the JSON API. Everything goes through the same
 * origin (the Vite dev proxy in development, the same host in production), so
 * the httpOnly refresh cookie is sent automatically. This layer knows nothing
 * about auth state — callers pass a token explicitly; the retry-on-401 logic
 * lives one layer up in lib/api.ts.
 */

const API_BASE = '/api/v1';

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

/** An unsuccessful HTTP response, carrying the API's error code and message. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/** Performs one API request and returns the parsed JSON body (or undefined for 204). */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
    signal: options.signal,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | undefined;
    throw new HttpError(
      response.status,
      envelope?.error?.code ?? 'HTTP_ERROR',
      envelope?.error?.message ?? response.statusText,
      envelope?.error?.details,
    );
  }
  return payload as T;
}
