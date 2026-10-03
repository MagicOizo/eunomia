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
  // `require` answers `any`; the two fields we read are asserted here.
  const packageJson = require('../../package.json') as PackageJson;
  return packageJson.version;
}

/**
 * The environment this instance runs in, as the version endpoint reports it.
 * Read from the process rather than from `AppConfig` on purpose: the version
 * route doubles as the container health check and is mounted without config
 * (see app.ts), so it must work before anything else is wired up.
 *
 * The production image pins NODE_ENV=production (apps/api/Dockerfile); compose
 * lets an operator override it, which is how a container running as a DEV
 * instance marks itself without a code change.
 */
export function readEnvironment(): string {
  return process.env.NODE_ENV ?? 'development';
}
