import { createRequire } from 'node:module';

import { Router } from 'express';

const require = createRequire(import.meta.url);

interface PackageJson {
  version: string;
}

/**
 * Reads the running version from package.json instead of hardcoding it, so
 * this always reflects what was actually built into the current image. The
 * relative path resolves correctly both under tsx (running src/routes/*.ts)
 * and after tsc compiles to dist/routes/*.js, since both mirror the same
 * directory depth relative to the package root.
 */
function readPackageVersion(): string {
  const packageJson = require('../../package.json') as PackageJson;
  return packageJson.version;
}

export const versionRouter = Router();

versionRouter.get('/version', (_req, res) => {
  res.json({ version: readPackageVersion() });
});
