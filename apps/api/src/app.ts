import express, { type Express } from 'express';
import type { Pool } from 'mariadb';

import { createAuthRouter } from './auth/routes.js';
import type { AppConfig } from './config/env.js';
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
    app.use('/api/v1', createAuthRouter(deps.pool, deps.config));
  }

  app.use(errorHandler);

  return app;
}
