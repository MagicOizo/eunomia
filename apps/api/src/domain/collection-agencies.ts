import type { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { createMasterDataRouter } from '../crud/master-data-router.js';
import type { CrudTable } from '../crud/repository.js';

const table: CrudTable = {
  table: 'CollectionAgencies',
  uidColumn: 'agencyUID',
  statusColumn: 'agencyStatus',
  entity: 'agency',
  columns: ['agencyName', 'bankAccount'],
};

const base = z.object({
  agencyName: z.string().trim().min(1).max(100),
  // IBAN — kept as a loose length/charset check; not a full checksum validation.
  bankAccount: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{15,34}$/, 'Expected an IBAN-like account'),
});

/** CRUD router for collection agencies (Inkasso). */
export function createCollectionAgenciesRouter(pool: Pool, config: AppConfig): Router {
  return createMasterDataRouter(pool, config, {
    table,
    resource: 'Collection agency',
    managePermission: PERMISSIONS.MANAGE_AGENCIES,
    createSchema: base,
    updateSchema: base.partial(),
  });
}
