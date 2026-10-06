import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ERROR_CODES } from '@eunomia/shared';
import express, { type Express, type Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Pool } from 'mariadb';

import { createUserAdminRouter } from './auth/admin-routes.js';
import { createAuthRouter } from './auth/routes.js';
import type { AppConfig } from './config/env.js';
import { createAccountsRouter } from './domain/accounts.js';
import { createAgencyPaymentDetailsRouter } from './domain/agency-payment-details.js';
import { createAllocationsRouter } from './domain/allocations.js';
import { createCollectionAgenciesRouter } from './domain/collection-agencies.js';
import {
  createContractPremiumsRouter,
  createContractTermsRouter,
} from './domain/contract-history.js';
import { createContractYearsRouter } from './domain/contract-years.js';
import { createContractsRouter } from './domain/contracts.js';
import { createDashboardRouter } from './domain/dashboard.js';
import { createFacilitiesRouter } from './domain/facilities.js';
import { createInsuranceCompaniesRouter } from './domain/insurance-companies.js';
import { createInvoicesRouter } from './domain/invoices.js';
import { createReimbursementPlanRouter } from './domain/reimbursement-plan.js';
import { createServiceBillingsRouter } from './domain/service-billings.js';
import { createSubmissionsRouter } from './domain/submissions.js';
import { createTrashRouter } from './domain/trash.js';
import { errorHandler } from './lib/error-handler.js';
import { createUpdateCheckRouter } from './routes/update-check.js';
import { versionRouter } from './routes/version.js';
import { createSettingsRouter } from './settings/routes.js';

/** Optional dependencies for the routes that need a database and config. */
export interface AppDependencies {
  pool: Pool;
  config: AppConfig;
  /** Absolute path to the built SPA (apps/web/dist). When present, the API serves it. */
  webRoot?: string;
}

/**
 * Where every database-backed router hangs, as data rather than as a sequence
 * of `app.use` calls — so a test can walk the same list and assert that each
 * route it finds is guarded (SEC-17, Sicherheits-Review I-1/I-2). A router that
 * is mounted is a router that is checked: there is no second list that could
 * fall out of step, because this one IS the mounting.
 *
 * Express 5 keeps no mount path on a router layer (no `regexp`, no `path` — the
 * matcher closes over the pattern), so the prefix is not recoverable from the
 * built app. It has to be readable here or nowhere.
 *
 * `versionRouter` is deliberately not in the list: it needs no pool, doubles as
 * the container health check, and is the one route that answers before anyone
 * has logged in — see the exception list of I-1.
 */
export const API_MOUNTS: ReadonlyArray<{
  path: string;
  create: (pool: Pool, config: AppConfig) => Router;
}> = [
  { path: '/api/v1', create: createAuthRouter },
  { path: '/api/v1', create: createUserAdminRouter },
  { path: '/api/v1', create: createUpdateCheckRouter },
  { path: '/api/v1', create: createSettingsRouter },
  { path: '/api/v1/accounts', create: createAccountsRouter },
  { path: '/api/v1/accounts', create: createReimbursementPlanRouter },
  { path: '/api/v1/companies', create: createInsuranceCompaniesRouter },
  { path: '/api/v1/contracts', create: createContractsRouter },
  { path: '/api/v1/contracts', create: createContractPremiumsRouter },
  { path: '/api/v1/contracts', create: createContractTermsRouter },
  { path: '/api/v1/contracts', create: createContractYearsRouter },
  { path: '/api/v1/facilities', create: createFacilitiesRouter },
  { path: '/api/v1/agencies', create: createCollectionAgenciesRouter },
  { path: '/api/v1/agencies', create: createAgencyPaymentDetailsRouter },
  { path: '/api/v1/invoices', create: createInvoicesRouter },
  { path: '/api/v1/submissions', create: createSubmissionsRouter },
  { path: '/api/v1/billings', create: createServiceBillingsRouter },
  { path: '/api/v1/allocations', create: createAllocationsRouter },
  { path: '/api/v1/trash', create: createTrashRouter },
  { path: '/api/v1/dashboard', create: createDashboardRouter },
];

/**
 * The Content-Security-Policy for the one origin this server hands out: the
 * API under /api/v1 and the SPA it serves itself. Written out instead of taken
 * from helmet's defaults, because every relaxation here has a named reason —
 * and because this is the layer that keeps an injected URL from becoming code
 * in the origin that holds the access token (Sicherheits-Review, SEC-01/02).
 */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'connect-src': ["'self'"],
  // The brand fonts are self-hosted (apps/web/src/design-system/fonts.css).
  'font-src': ["'self'"],
  // The GiroCode is rendered as an SVG data URL, not fetched
  // (apps/web/src/invoices/PaymentQrPopover.vue).
  'img-src': ["'self'", 'data:'],
  // Vue writes :style bindings as inline style attributes, and
  // @fortawesome/fontawesome-svg-core inserts a <style> element of its own.
  // Both need 'unsafe-inline'; scripts do not, which is what matters.
  'style-src': ["'self'", "'unsafe-inline'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  // Deliberately NO upgrade-insecure-requests: the documented deployment is
  // reachable over plain http (http://localhost:3000, TLS at the proxy), and
  // the directive would upgrade this origin's own subresources to https, where
  // nothing answers.
};

/** Builds a rate limiter that responds with our JSON error envelope on 429. */
function limiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please try again later.',
      },
    },
  });
}

/**
 * Builds the Express app without starting a listener, so tests can exercise
 * it via supertest without binding a real port (see src/index.ts for that).
 *
 * `deps` is optional: the version route works without a database, so lightweight
 * tests can call `createApp()`. The API routers, rate limiting and the SPA are
 * only mounted when a pool + config are supplied.
 */
export function createApp(deps?: AppDependencies): Express {
  const app = express();
  // Security headers first, so they are on every answer — including the ones
  // the error handler writes and the 404 of a route that does not exist. Also
  // on the deps-less app, which is what the header test builds.
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
      // Half a year, and the proxy in front may well set its own. A browser
      // ignores it over plain http, so it costs a LAN instance nothing.
      strictTransportSecurity: { maxAge: 15552000, includeSubDomains: true },
      // The full path would otherwise travel to every externally linked
      // document (an invoice scan on someone else's server).
      referrerPolicy: { policy: 'no-referrer' },
      // helmet would say SAMEORIGIN; nothing here is ever framed, and this is
      // the old header saying what frame-ancestors above already says.
      xFrameOptions: { action: 'deny' },
    }),
  );
  // Written out rather than left to the default: 100 kB is what Express 5 uses
  // today, and the only body that comes close is a settings write or a billing
  // with its allocations. A major upgrade must not be able to move the limit
  // without anyone noticing.
  app.use(express.json({ limit: '100kb' }));

  if (deps) {
    const { config } = deps;
    // Behind a reverse proxy the real client IP arrives in X-Forwarded-For.
    app.set('trust proxy', config.trustProxy);
    // Generous baseline for the whole API, strict on the auth endpoints.
    app.use('/api', limiter(config.rateLimit.globalWindowMs, config.rateLimit.globalMax));
    app.use(
      [
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        // The "current password" field is a guessing target like any other.
        '/api/v1/auth/password',
        '/api/v1/setup',
      ],
      limiter(config.rateLimit.authWindowMs, config.rateLimit.authMax),
    );
  }

  // Version endpoint (no DB) doubles as the container health check.
  app.use('/api/v1', versionRouter);

  if (deps) {
    const { pool, config, webRoot } = deps;
    for (const mount of API_MOUNTS) {
      app.use(mount.path, mount.create(pool, config));
    }

    // In production the built SPA is served by this same server (same origin, so
    // the httpOnly refresh cookie works without proxy tricks). Absent in dev/
    // tests, where Vite serves the frontend separately.
    if (webRoot && existsSync(webRoot)) {
      app.use(express.static(webRoot));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(join(webRoot, 'index.html'));
      });
    }
  }

  app.use(errorHandler);

  return app;
}
