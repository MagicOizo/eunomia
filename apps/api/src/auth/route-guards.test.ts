import assert from 'node:assert/strict';
import test from 'node:test';

import { INSTANCE_PERMISSIONS, isInstancePermission } from '@eunomia/shared';
import type { Pool } from 'mariadb';
import request from 'supertest';

import { API_MOUNTS, createApp } from '../app.js';
import { testConfig } from '../test/harness.js';
import {
  type DiscoveredRoute,
  UNMOUNTED_ROUTES,
  declaredRouterFactories,
  discoverApiRoutes,
  withDummyParams,
} from '../test/route-table.js';

/**
 * Invariants I-1 and I-2 as a check instead of a promise (SEC-17).
 *
 * The review's point was not that a route is unguarded — all of them are — but
 * that only some carry the check as middleware. The rest check inside the
 * handler, sometimes only in the service function it calls, and a new route
 * that forgets the call would look exactly like the others. So this file reads
 * the route table back out of Express and demands of every route either a
 * guard it can see, or an entry in the table below saying where the check
 * really sits. A new route fails the suite until someone writes it down.
 *
 * That table is the first place in the repository where the authorization of
 * every endpoint is stated in one view. It is meant to be read.
 *
 * No database: the routers are built only to be walked (see route-table.ts).
 */

/** How a route is authorized when no middleware guard says so. */
type Declared =
  /** Deliberately open — the abschließend list of I-1. */
  | { kind: 'anonymous'; why: string }
  /** Any logged-in user may call it, by design; there is nothing to scope. */
  | { kind: 'authenticated'; why: string }
  /** Checked in the handler or in the service it calls, because the account follows from the entity. */
  | { kind: 'handler'; where: string };

const anonymous = (why: string): Declared => ({ kind: 'anonymous', why });
const authenticated = (why: string): Declared => ({ kind: 'authenticated', why });
const handler = (where: string): Declared => ({ kind: 'handler', where });

/**
 * Every route that the guard walker cannot classify on its own. Middleware-
 * guarded routes are deliberately absent: they are read off the chain, so they
 * cannot drift from this list.
 */
const DECLARED: Record<string, Declared> = {
  // I-1's exception list, in full. Each of these answers before anyone holds a
  // token, which is exactly why each needs a reason.
  'GET /api/v1/version': anonymous('the SPA titles the tab before login; also the health check'),
  'POST /api/v1/setup': anonymous('creates the first administrator, guarded by X-Setup-Token'),
  'POST /api/v1/auth/login': anonymous('hands out the first token'),
  'POST /api/v1/auth/refresh': anonymous('authenticated by the refresh cookie, not by a token'),
  'POST /api/v1/auth/logout': anonymous('must work even with an expired access token'),

  // Authenticated and nothing more, on purpose.
  'POST /api/v1/auth/password': authenticated('own password, proven with the current one'),
  'GET /api/v1/me': authenticated('reports the caller to themselves'),
  'PATCH /api/v1/me': authenticated("sets the caller's own language and format"),
  'GET /api/v1/companies': authenticated('global master data; it fills the invoice forms'),
  'GET /api/v1/companies/:uid': authenticated('global master data'),
  'GET /api/v1/facilities': authenticated('global master data'),
  'GET /api/v1/facilities/:uid': authenticated('global master data'),
  'GET /api/v1/agencies': authenticated('global master data'),
  'GET /api/v1/agencies/:uid': authenticated('global master data'),

  // The account follows from the entity, so the check cannot precede the load.
  'GET /api/v1/accounts': handler('accountFilter(VIEW_ACCOUNTS)'),
  'GET /api/v1/accounts/:accountUID/reimbursement-plan': handler('authorizeAccount(VIEW_INVOICES)'),

  'GET /api/v1/contracts': handler('accountFilter(VIEW_CONTRACTS)'),
  'GET /api/v1/dashboard': handler(
    'accountFilter per figure: VIEW_INVOICES, VIEW_CONTRACTS, VIEW_ACCOUNTS (dashboard.ts)',
  ),
  'GET /api/v1/contracts/:uid': handler('loadAuthorizedContract(VIEW_CONTRACTS)'),
  'POST /api/v1/contracts': handler("hasPermission(MANAGE_CONTRACTS, body's accountUID)"),
  'PATCH /api/v1/contracts/:uid': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),
  'DELETE /api/v1/contracts/:uid': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),
  'POST /api/v1/contracts/:uid/premiums': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),
  'PATCH /api/v1/contracts/:uid/premiums/:entryUID': handler(
    'loadAuthorizedContract(MANAGE_CONTRACTS)',
  ),
  'DELETE /api/v1/contracts/:uid/premiums/:entryUID': handler(
    'loadAuthorizedContract(MANAGE_CONTRACTS)',
  ),
  'POST /api/v1/contracts/:uid/terms': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),
  'PATCH /api/v1/contracts/:uid/terms/:entryUID': handler(
    'loadAuthorizedContract(MANAGE_CONTRACTS)',
  ),
  'DELETE /api/v1/contracts/:uid/terms/:entryUID': handler(
    'loadAuthorizedContract(MANAGE_CONTRACTS)',
  ),
  'PUT /api/v1/contracts/:uid/years/:year': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),
  'DELETE /api/v1/contracts/:uid/years/:year': handler('loadAuthorizedContract(MANAGE_CONTRACTS)'),

  'GET /api/v1/invoices': handler(
    'hasPermission on ?accountUID, else accountFilter(VIEW_INVOICES)',
  ),
  'GET /api/v1/invoices/years': handler(
    'hasPermission on ?accountUID, else accountFilter(VIEW_INVOICES)',
  ),
  'GET /api/v1/invoices/:uid': handler('authorizeAccount(VIEW_INVOICES)'),
  'POST /api/v1/invoices': handler("authorizeAccount(MANAGE_INVOICES, body's accountUID)"),
  'PATCH /api/v1/invoices/:uid': handler('requireInvoiceAccount(MANAGE_INVOICES)'),
  'POST /api/v1/invoices/:uid/exclusions': handler('requireInvoiceAccount(MANAGE_INVOICES)'),
  'DELETE /api/v1/invoices/:uid/exclusions/:contractUID': handler(
    'requireInvoiceAccount(MANAGE_INVOICES)',
  ),
  'DELETE /api/v1/invoices/:uid': handler('requireInvoiceAccount(MANAGE_INVOICES)'),

  'POST /api/v1/submissions': handler('requireContractAccount(MANAGE_INVOICES)'),
  'GET /api/v1/submissions': handler('accountFilter(VIEW_INVOICES)'),
  'GET /api/v1/submissions/:uid': handler('requireSubmissionAccount(VIEW_INVOICES)'),
  'DELETE /api/v1/submissions/:uid/invoices/:invoiceUID': handler(
    'requireSubmissionAccount(MANAGE_INVOICES)',
  ),

  'GET /api/v1/billings': handler(
    'requireContractAccount on ?contractUID, else accountFilter(VIEW_INVOICES)',
  ),
  'GET /api/v1/billings/:uid': handler('requireBillingAccount(VIEW_INVOICES)'),
  'POST /api/v1/billings': handler('requireContractAccount(MANAGE_INVOICES)'),
  // The one the review names: the route body shows no check at all.
  'POST /api/v1/billings/:uid/allocations': handler(
    'createAllocationsForBilling → authorizeAccount(MANAGE_INVOICES)',
  ),
  'PATCH /api/v1/billings/:uid': handler('requireBillingAccount(MANAGE_INVOICES)'),
  'DELETE /api/v1/billings/:uid': handler('requireBillingAccount(MANAGE_INVOICES)'),

  'GET /api/v1/allocations': handler('accountFilter(VIEW_INVOICES)'),
  'GET /api/v1/allocations/:uid': handler('requireAllocationAccount(VIEW_INVOICES)'),
  // The second one the review names.
  'PATCH /api/v1/allocations/:uid': handler('updateAllocation → authorizeAccount(MANAGE_INVOICES)'),
  'DELETE /api/v1/allocations/:uid': handler('requireAllocationAccount(MANAGE_INVOICES)'),
};

/**
 * An account-scoped permission checked WITHOUT an account is normally a bug —
 * it would pass only on a global grant and quietly lock out everyone else.
 * These are the deliberate cases.
 */
const UNSCOPED_ON_PURPOSE: Record<string, string> = {
  'POST /api/v1/accounts': 'creating an insured person has no account to scope to yet',
};

/**
 * The number of routes the API answers today, as a floor. Adding routes needs
 * no change here; losing one fails, which is the point — a suite that silently
 * looks at less than the whole API proves nothing. Lower it deliberately when a
 * route is deliberately removed.
 */
const MINIMUM_ROUTES = 83;

function allRoutes(): DiscoveredRoute[] {
  // Never connected to — the routers only get walked, see route-table.ts.
  const pool = {} as Pool;
  return [...UNMOUNTED_ROUTES, ...discoverApiRoutes(pool, testConfig())];
}

const routes = allRoutes();

function hasAuth(route: DiscoveredRoute): boolean {
  return route.guards.some((guard) => guard.kind === 'auth');
}

function permissionGuards(route: DiscoveredRoute) {
  return route.guards.filter((guard) => guard.kind === 'permission');
}

test('every router the source declares is mounted, so nothing escapes the sweep', async () => {
  const declared = (await declaredRouterFactories()).toSorted();
  const mounted = API_MOUNTS.map((mount) => mount.create.name).toSorted();
  assert.deepEqual(
    declared,
    [...new Set(mounted)].toSorted(),
    'a router factory exists that API_MOUNTS does not mount (or the other way round)',
  );
});

test('the route table is read in full', () => {
  assert.ok(
    routes.length >= MINIMUM_ROUTES,
    `found only ${routes.length} routes; a router may have fallen out of API_MOUNTS`,
  );
  const duplicates = routes
    .map((route) => route.signature)
    .filter((signature, index, all) => all.indexOf(signature) !== index);
  assert.deepEqual(duplicates, [], 'two routers answer the same method and path');
});

test('I-1: every route is guarded, and the exceptions are exactly the five named ones', () => {
  const unguarded = routes.filter((route) => !hasAuth(route)).map((route) => route.signature);
  const declaredAnonymous = Object.entries(DECLARED)
    .filter(([, how]) => how.kind === 'anonymous')
    .map(([signature]) => signature);

  assert.deepEqual(
    unguarded.toSorted(),
    declaredAnonymous.toSorted(),
    'a route answers without requireAuth that is not on I-1’s exception list (or the other way round)',
  );
});

test('I-2: every route is permission-checked, by middleware or by a named handler', () => {
  const unexplained = routes
    .filter((route) => permissionGuards(route).length === 0 && !(route.signature in DECLARED))
    .map((route) => route.signature);

  assert.deepEqual(
    unexplained,
    [],
    'these routes carry no permission middleware and are not declared — say where they check, or add the guard',
  );
});

test('the declared list carries no route that no longer exists', () => {
  const live = new Set(routes.map((route) => route.signature));
  const stale = Object.keys(DECLARED).filter((signature) => !live.has(signature));
  assert.deepEqual(stale, [], 'declared authorization for a route that is gone');

  const staleUnscoped = Object.keys(UNSCOPED_ON_PURPOSE).filter(
    (signature) => !live.has(signature),
  );
  assert.deepEqual(staleUnscoped, []);
});

test('a middleware guard never contradicts the declared list', () => {
  const both = routes
    .filter((route) => permissionGuards(route).length > 0)
    .filter((route) => DECLARED[route.signature]?.kind === 'handler')
    .map((route) => route.signature);
  assert.deepEqual(both, [], 'declared as handler-checked while a guard already covers it');
});

/**
 * SEC-04's promise, kept here instead of only in §2.4 of the plan: an
 * account-scoped grant of an instance-wide permission counts for nothing, so a
 * guard that scopes one would silently accept a grant that can never satisfy
 * it. The other half — that the grant really is ineffective — is checked
 * against the database in permissions.integration.test.ts.
 */
test('SEC-04: an instance-wide permission is never checked per account', () => {
  const scopedInstance = routes.flatMap((route) =>
    permissionGuards(route)
      .filter((guard) => guard.scoped && isInstancePermission(guard.permission))
      .map((guard) => `${route.signature} (${guard.permission})`),
  );
  assert.deepEqual(
    scopedInstance,
    [],
    `one of ${INSTANCE_PERMISSIONS.join(', ')} is checked with an account; such a grant never counts`,
  );
});

test('an account-scoped permission is checked with an account, except where named', () => {
  const unscoped = routes.flatMap((route) =>
    permissionGuards(route)
      .filter((guard) => !guard.scoped && !isInstancePermission(guard.permission))
      .filter(() => !(route.signature in UNSCOPED_ON_PURPOSE))
      .map((guard) => `${route.signature} (${guard.permission})`),
  );
  assert.deepEqual(
    unscoped,
    [],
    'an account-scoped permission is checked globally here, so only a global grant would pass',
  );
});

/**
 * The same sweep over HTTP, so the structure above is not only declared but
 * observed: a route may well carry `requireAuth` in its chain and still answer,
 * if a later hand mounts something in front of it. Needs no database — a
 * request without a token is refused before anything is looked up.
 */
test('I-1 over HTTP: every guarded route answers 401 without a token', async () => {
  const app = createApp({ pool: {} as Pool, config: testConfig() });
  const anonymousRoutes = new Set(
    Object.entries(DECLARED)
      .filter(([, how]) => how.kind === 'anonymous')
      .map(([signature]) => signature),
  );

  const answered: string[] = [];
  for (const route of routes) {
    if (anonymousRoutes.has(route.signature)) continue;
    const path = withDummyParams(route.path);
    const response = await request(app)
      [route.method as 'get' | 'post' | 'put' | 'patch' | 'delete'](path)
      .send({});
    if (response.status !== 401) {
      answered.push(`${route.method.toUpperCase()} ${path} → ${response.status}`);
    }
  }
  assert.deepEqual(answered, [], 'a route answered something other than 401 without a token');
});

test('the version endpoint answers without a token, as the SPA needs', async () => {
  const app = createApp();
  const response = await request(app).get('/api/v1/version');
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.version, 'string');
});
