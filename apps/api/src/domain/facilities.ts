import { PERMISSIONS } from '@eunomia/shared';
import type { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import type { AppConfig } from '../config/env.js';
import { createMasterDataRouter } from '../crud/master-data-router.js';
import type { CrudTable } from '../crud/repository.js';

export const facilitiesTable: CrudTable = {
  table: 'Facilities',
  uidColumn: 'facilityUID',
  statusColumn: 'facilityStatus',
  entity: 'facility',
  columns: ['facilityName', 'distanceKm'],
};

const base = z.object({
  facilityName: z.string().trim().min(1).max(100),
  distanceKm: z.number().int().min(0).max(65535).nullish(),
});

/** CRUD router for facilities (doctors, hospitals, pharmacies). */
export function createFacilitiesRouter(pool: Pool, config: AppConfig): Router {
  return createMasterDataRouter(pool, config, {
    table: facilitiesTable,
    resource: 'Facility',
    managePermission: PERMISSIONS.MANAGE_FACILITIES,
    createSchema: base,
    updateSchema: base.partial(),
  });
}
