import { Router } from 'express';

import { readAppVersion } from '../lib/app-version.js';

export const versionRouter = Router();

versionRouter.get('/version', (_req, res) => {
  res.json({ version: readAppVersion() });
});
