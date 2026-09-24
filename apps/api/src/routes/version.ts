import { Router } from 'express';

import { readAppVersion, readEnvironment } from '../lib/app-version.js';

export const versionRouter = Router();

versionRouter.get('/version', (_req, res) => {
  // `environment` is what marks a non-production tab in the browser title
  // (apps/web/src/lib/app-info.ts) — public, because the SPA needs it before
  // anyone has logged in.
  res.json({ version: readAppVersion(), environment: readEnvironment() });
});
