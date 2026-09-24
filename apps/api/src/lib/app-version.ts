import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageJson {
  version: string;
}

/**
 * Reads the running version from package.json instead of hardcoding it, so
 * this always reflects what was actually built into the current image. The
 * relative path resolves correctly both under tsx (running src/lib/*.ts) and
 * after tsc compiles to dist/lib/*.js, since both mirror the same directory
 * depth relative to the package root.
 */
export function readAppVersion(): string {
  const packageJson = require('../../package.json') as PackageJson;
  return packageJson.version;
}
