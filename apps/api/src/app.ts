import { existsSync } from 'node:fs';
import { join } from 'node:path';

import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'mariadb';

import { createUserAdminRouter } from './auth/admin-routes.js';
import { createAuthRouter } from './auth/routes.js';
import type { AppConfig } from './config/env.js';
import { createAccountsRouter } from './domain/accounts.js';
import { createAgencyAccountsRouter } from './domain/agency-accounts.js';
import { createAllocationsRouter } from './domain/allocations.js';
import { createCollectionAgenciesRouter } from './domain/collection-agencies.js';
import {
  createContractPremiumsRouter,
  createContractTermsRouter,
} from './domain/contract-history.js';
import { createContractYearsRouter } from './domain/contract-years.js';
import { createContractsRouter } from './domain/contracts.js';
import { createFacilitiesRouter } from './domain/facilities.js';
import { createInsuranceCompaniesRouter } from './domain/insurance-companies.js';
import { createInvoicesRouter } from './domain/invoices.js';
import { createReimbursementPlanRouter } from './domain/reimbursement-plan.js';
import { createServiceBillingsRouter } from './domain/service-billings.js';
import { createSubmissionsRouter } from './domain/submissions.js';
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

/** Builds a rate limiter that responds with our JSON error envelope on 429. */
function limiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
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
  app.use(express.json());

  if (deps) {
    const { config } = deps;
    // Behind a reverse proxy the real client IP arrives in X-Forwarded-For.
    app.set('trust proxy', config.trustProxy);
    // Generous baseline for the whole API, strict on the auth endpoints.
    app.use('/api', limiter(config.rateLimit.globalWindowMs, config.rateLimit.globalMax));
    app.use(
      ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/setup'],
      limiter(config.rateLimit.authWindowMs, config.rateLimit.authMax),
    );
  }

  // Version endpoint (no DB) doubles as the container health check.
  app.use('/api/v1', versionRouter);

  if (deps) {
    const { pool, config, webRoot } = deps;
    app.use('/api/v1', createAuthRouter(pool, config));
    app.use('/api/v1', createUserAdminRouter(pool, config));
    app.use('/api/v1', createUpdateCheckRouter(pool, config));
    app.use('/api/v1', createSettingsRouter(pool, config));
    app.use('/api/v1/accounts', createAccountsRouter(pool, config));
    app.use('/api/v1/accounts', createReimbursementPlanRouter(pool, config));
    app.use('/api/v1/companies', createInsuranceCompaniesRouter(pool, config));
    app.use('/api/v1/contracts', createContractsRouter(pool, config));
    app.use('/api/v1/contracts', createContractPremiumsRouter(pool, config));
    app.use('/api/v1/contracts', createContractTermsRouter(pool, config));
    app.use('/api/v1/contracts', createContractYearsRouter(pool, config));
    app.use('/api/v1/facilities', createFacilitiesRouter(pool, config));
    app.use('/api/v1/agencies', createCollectionAgenciesRouter(pool, config));
    app.use('/api/v1/agencies', createAgencyAccountsRouter(pool, config));
    app.use('/api/v1/invoices', createInvoicesRouter(pool, config));
    app.use('/api/v1/submissions', createSubmissionsRouter(pool, config));
    app.use('/api/v1/billings', createServiceBillingsRouter(pool, config));
    app.use('/api/v1/allocations', createAllocationsRouter(pool, config));

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
