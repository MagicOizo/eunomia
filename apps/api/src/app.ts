import express, { type Express } from 'express';

import { versionRouter } from './routes/version.js';

/**
 * Builds the Express app without starting a listener, so tests can exercise
 * it via supertest without binding a real port (see src/index.ts for that).
 */
export function createApp(): Express {
  const app = express();

  app.get('/', (_req, res) => {
    res.json({ service: 'eunomia-api', status: 'ok' });
  });

  app.use('/api/v1', versionRouter);

  return app;
}
