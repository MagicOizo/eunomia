import express, { type Express } from 'express';
import type { Pool } from 'mariadb';

import { createAuthRouter } from './auth/routes.js';
import type { AppConfig } from './config/env.js';
import { createAccountsRouter } from './domain/accounts.js';
import { createAllocationsRouter } from './domain/allocations.js';
import { createCollectionAgenciesRouter } from './domain/collection-agencies.js';
import { createContractsRouter } from './domain/contracts.js';
import { createFacilitiesRouter } from './domain/facilities.js';
import { createInsuranceCompaniesRouter } from './domain/insurance-companies.js';
import { createInvoicesRouter } from './domain/invoices.js';
import { createReimbursementAnalysisRouter } from './domain/reimbursement-analysis.js';
import { createServiceBillingsRouter } from './domain/service-billings.js';
import { createSubmissionsRouter } from './domain/submissions.js';
import { errorHandler } from './lib/error-handler.js';
import { versionRouter } from './routes/version.js';

/** Optional dependencies for the routes that need a database and config. */
export interface AppDependencies {
  pool: Pool;
  config: AppConfig;
}

/**
 * Builds the Express app without starting a listener, so tests can exercise
 * it via supertest without binding a real port (see src/index.ts for that).
 *
 * `deps` is optional: the liveness and version routes work without a database,
 * so lightweight tests can call `createApp()`. The auth/rights routes are only
 * mounted when a pool and config are supplied.
 */
export function createApp(deps?: AppDependencies): Express {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ service: 'eunomia-api', status: 'ok' });
  });

  app.use('/api/v1', versionRouter);

  if (deps) {
    const { pool, config } = deps;
    app.use('/api/v1', createAuthRouter(pool, config));
    app.use('/api/v1/accounts', createAccountsRouter(pool, config));
    app.use('/api/v1/companies', createInsuranceCompaniesRouter(pool, config));
    app.use('/api/v1/contracts', createContractsRouter(pool, config));
    app.use('/api/v1/contracts', createReimbursementAnalysisRouter(pool, config));
    app.use('/api/v1/facilities', createFacilitiesRouter(pool, config));
    app.use('/api/v1/agencies', createCollectionAgenciesRouter(pool, config));
    app.use('/api/v1/invoices', createInvoicesRouter(pool, config));
    app.use('/api/v1/submissions', createSubmissionsRouter(pool, config));
    app.use('/api/v1/billings', createServiceBillingsRouter(pool, config));
    app.use('/api/v1/allocations', createAllocationsRouter(pool, config));
  }

  app.use(errorHandler);

  return app;
}
