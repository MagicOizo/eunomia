/**
 * Reads the API's route table back out of Express, so the guards on it can be
 * asserted instead of trusted (SEC-17). Test infrastructure, not production
 * code — nothing under src/ outside the tests imports it.
 *
 * Two things make this harder than it sounds, both consequences of Express 5:
 *
 *  - A router layer keeps no mount path. There is no `regexp` and no `path` on
 *    it; the matcher closes over the compiled pattern. The prefix therefore
 *    comes from `API_MOUNTS` in app.ts and nowhere else.
 *  - A `router.use('/users', requireAuth)` layer keeps no path either, so
 *    whether it covers a given route cannot be read — but it can be ASKED:
 *    calling the layer's matcher with the route's own path string answers it,
 *    because a `use` matcher is a prefix matcher (`/users/:uuid` matches the
 *    `/users` layer, `/roles` does not).
 */

import { readFile, readdir } from 'node:fs/promises';

import type { Pool } from 'mariadb';

import { API_MOUNTS } from '../app.js';
import { type GuardInfo, guardInfo } from '../auth/middleware.js';
import type { AppConfig } from '../config/env.js';

/** One route as Express holds it, with everything that guards it. */
export interface DiscoveredRoute {
  /** Lowercase HTTP method, as Express spells it in `route.methods`. */
  method: string;
  /** The full path including the mount prefix, e.g. `/api/v1/invoices/:uid`. */
  path: string;
  /** `METHOD /path`, the form the exception lists in the tests are written in. */
  signature: string;
  /** The guards reaching this route, in the order they run. */
  guards: GuardInfo[];
}

/**
 * The shape of the Express internals this file reads. Express publishes no type
 * for a router's stack, so it is described here once — the single foreign-API
 * assertion in this module, and the reason it is confined to it.
 */
interface RouteLike {
  path: string;
  methods: Record<string, boolean | undefined>;
  stack: Array<{ handle: unknown }>;
}
interface LayerLike {
  handle: unknown;
  route?: RouteLike;
  matchers?: Array<(input: string) => unknown>;
}
interface RouterLike {
  stack: LayerLike[];
}

/** Joins a mount prefix and a route path without doubling or dropping a slash. */
function joinPath(prefix: string, path: string): string {
  if (path === '/') return prefix;
  return `${prefix}${path}`;
}

/**
 * Whether a pathless `use` layer covers this route path. A matcher returns a
 * match object or `false`; a layer without matchers (nothing in this app) is
 * treated as covering everything, which is what `use()` without a path does.
 */
function covers(layer: LayerLike, routePath: string): boolean {
  if (!layer.matchers) return true;
  return layer.matchers.some((match) => match(routePath) !== false);
}

/** Every route of one router, with the prefix it is mounted under. */
function routesOf(router: RouterLike, prefix: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  for (const [index, layer] of router.stack.entries()) {
    const route = layer.route;
    if (!route) continue;

    // Only middleware registered BEFORE the route runs before it; a use() that
    // comes later in the stack never sees this request.
    const fromRouter = router.stack
      .slice(0, index)
      .filter((earlier) => !earlier.route && covers(earlier, route.path))
      .map((earlier) => guardInfo(earlier.handle));
    const fromRoute = route.stack.map((handler) => guardInfo(handler.handle));
    const guards = [...fromRouter, ...fromRoute].filter(
      (info): info is GuardInfo => info !== undefined,
    );

    const path = joinPath(prefix, route.path);
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (!enabled) continue;
      routes.push({ method, path, signature: `${method.toUpperCase()} ${path}`, guards });
    }
  }
  return routes;
}

/**
 * Every route the API mounts, built from `API_MOUNTS`. The pool is only stored
 * by the routers, never queried while they are constructed, so a structural
 * check needs no database — see auth/route-guards.test.ts, which passes a stub.
 */
export function discoverApiRoutes(pool: Pool, config: AppConfig): DiscoveredRoute[] {
  return API_MOUNTS.flatMap((mount) =>
    routesOf(mount.create(pool, config) as unknown as RouterLike, mount.path),
  );
}

/**
 * The routes outside `API_MOUNTS`: everything `createApp` mounts by hand. Today
 * that is the version endpoint alone, and it is listed so the guard tests cover
 * the whole surface of /api/v1 rather than most of it.
 */
export const UNMOUNTED_ROUTES: readonly DiscoveredRoute[] = [
  { method: 'get', path: '/api/v1/version', signature: 'GET /api/v1/version', guards: [] },
];

/**
 * The directories that own endpoints. A router factory under one of them is
 * meant to be mounted; `src/crud/master-data-router.ts` is a shared builder and
 * lives outside them on purpose, which is why this needs no exception list.
 */
const ROUTE_DIRECTORIES = ['domain', 'auth', 'routes', 'settings'];

/**
 * Every router factory the source declares, found by reading the files rather
 * than by importing a list — a router that exists but is in no list is exactly
 * the hole SEC-17 describes, and a list cannot find itself missing.
 */
export async function declaredRouterFactories(): Promise<string[]> {
  const names: string[] = [];
  for (const directory of ROUTE_DIRECTORIES) {
    const base = new URL(`../${directory}/`, import.meta.url);
    for (const entry of await readdir(base)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      const source = await readFile(new URL(entry, base), 'utf8');
      for (const match of source.matchAll(/export function (create\w*Router)\(/g)) {
        // The group is in the pattern, so a match always carries it.
        names.push(match[1] ?? '');
      }
    }
  }
  return names;
}

/** Replaces `:params` with a value that any route will accept, for a request that must fail at the guard. */
export function withDummyParams(path: string): string {
  return path.replace(/:[A-Za-z]+/g, 'x');
}
