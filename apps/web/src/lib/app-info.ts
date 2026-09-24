import { request } from './http';

/**
 * What the public version endpoint says about this instance: which version runs
 * and which environment it is. Fetched once per page load and shared, because
 * two consumers need it — the footer shows the version, and the browser title
 * marks anything that is not production, so a tab is recognisable at a glance.
 */
export interface AppInfo {
  version: string;
  environment: string;
}

/** The app's name, with the environment appended unless this is production. */
export const APP_NAME = 'Eunomia';

/**
 * Short forms for the environments that have an established abbreviation. The
 * tab is narrow, and 'Eunomia-DEVELOPMENT' would be the first thing a title
 * gets truncated to nothing from.
 */
const SHORT_NAMES: Record<string, string> = { development: 'DEV' };

/**
 * Builds the browser title. Production keeps the bare name; every other
 * environment is marked, so a DEV tab is never mistaken for the real one.
 * The environment comes from the API rather than from `import.meta.env.DEV`,
 * which is only true under the Vite dev server and would leave a container
 * running as a DEV instance indistinguishable from production.
 */
export function appTitle(environment: string | null): string {
  const name = environment?.trim().toLowerCase() ?? '';
  if (name === '' || name === 'production') return APP_NAME;
  return `${APP_NAME}-${SHORT_NAMES[name] ?? name.toUpperCase()}`;
}

/** In flight or resolved: the one request every consumer shares. */
let pending: Promise<AppInfo | null> | null = null;

/**
 * Reads version and environment, at most once per page load. A failure is not
 * worth complaining about — the caller falls back to the static title and an
 * empty version slot — but it is not cached either, so a later caller retries.
 */
export function loadAppInfo(): Promise<AppInfo | null> {
  pending ??= request<AppInfo>('/version').catch(() => {
    pending = null;
    return null;
  });
  return pending;
}

/** Test seam: drops the memoised request so each case starts from scratch. */
export function resetAppInfo(): void {
  pending = null;
}
