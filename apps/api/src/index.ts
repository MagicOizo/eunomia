import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { createPool, waitForDatabase } from './db/pool.js';

const config = loadConfig();
const pool = createPool(config.database);

// Bring the schema up to date before serving any traffic. Combined with a
// restored older backup, this is also the upgrade path (see
// Notes/eunomia-plan.md, 2.1).
await waitForDatabase(pool);
await runMigrations(pool);

// The built SPA sits next to the compiled API in the production image
// (/app/apps/web/dist). Absent in dev, where Vite serves it — createApp only
// serves it when the directory exists.
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = process.env.WEB_ROOT ?? join(here, '..', '..', 'web', 'dist');

const app = createApp({ pool, config, webRoot });

const server = app.listen(config.port, () => {
  console.log(`Eunomia API listening on port ${config.port}`);
});

/** Closes the HTTP server and database pool on shutdown signals. */
async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
